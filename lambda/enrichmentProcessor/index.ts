// File: lambda/enrichmentProcessor/index.ts

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Pool, Client } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { ruleProcessors } from './processors';

// Initialize S3 client
const s3Client = new S3Client({ region: process.env.AWS_REGION });

// Connection configuration
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
};

// Define status enums
enum EnrichmentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

/**
 * Main Lambda handler for claim enrichment
 * @param event The Lambda event containing batchId, fileId, and row range
 */
export const handler = async (event: any) => {
  console.log('Starting enrichment processing with event:', JSON.stringify(event));
  
  const { batchId, fileId, startRow, endRow } = event;
  
  // Validate required parameters
  if (!batchId || !fileId || startRow === undefined || endRow === undefined) {
    throw new Error('Missing required parameters: batchId, fileId, startRow, or endRow');
  }
  
  // Create a new client for this invocation rather than a pool
  const client = new Client(dbConfig);
  
  try {
    // Connect to the database
    await client.connect();
    
    // Set schema if defined
    if (process.env.DB_SCHEMA) {
      await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
    }
    
    // Update batch status to PROCESSING
    await updateBatchStatus(client, batchId, 'PROCESSING');
    
    // Fetch the batch information from database
    const batchInfo = await getBatchInfo(client, batchId);
    
    // Fetch claims for this batch
    const claims = await fetchClaimRecords(client, fileId, startRow, endRow);
    console.log(`Processing ${claims.length} claims for batch ${batchId}`);
    
    // Process each claim
    const results = await processClaims(client, claims, ruleProcessors);
    
    // Update batch status to COMPLETED
    await updateBatchStatus(client, batchId, 'COMPLETED', {
      totalProcessed: claims.length,
      enriched: results.enriched,
      failed: results.failed
    });
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Batch enrichment completed successfully',
        batchId,
        fileId,
        results
      })
    };
  } catch (error) {
    console.error('Error during enrichment processing:', error);
    
    // Update batch status to ERROR
    try {
      await handleProcessingError(client, batchId, error);
    } catch (handlingError) {
      console.error('Error handling processing error:', handlingError);
    }
    
    // Re-throw the error to be caught by Lambda
    throw error;
  } finally {
    // Close the client connection
    try {
      await client.end();
    } catch (e) {
      console.error('Error closing client:', e);
    }
  }
};

/**
 * Get batch information from database
 */
async function getBatchInfo(client: Client, batchId: string) {
  const result = await client.query(`
    SELECT 
      batch_id,
      file_id,
      start_row,
      end_row,
      total_rows,
      processing_status,
      enrichment_status,
      retry_count
    FROM batch_processing_status
    WHERE batch_id = $1
  `, [batchId]);
  
  if (result.rows.length === 0) {
    throw new Error(`Batch ${batchId} not found`);
  }
  
  return result.rows[0];
}

/**
 * Update batch status in the database
 */
async function updateBatchStatus(client: Client, batchId: string, status: string, details?: any) {
  const params = [status];
  let paramIndex = 2;
  const updateFields = ['enrichment_status = $1', 'updated_at = CURRENT_TIMESTAMP'];
  
  
  if (status === 'COMPLETED') {
    updateFields.push('enriched_at = CURRENT_TIMESTAMP');
  }
  
  // If details are provided, add them to the update
  if (details) {
    updateFields.push(`enrichment_details = $${paramIndex}::jsonb`);
    params.push(JSON.stringify(details));
    paramIndex++;
  }

  params.push(batchId);

  const sql = `
    UPDATE batch_processing_status
    SET ${updateFields.join(', ')}
    WHERE batch_id = $${paramIndex}
  `;

  console.log('Update SQL:', sql);
  console.log('Parameters:', params);
  
  try {
    await client.query(sql, params);
  } catch (error) {
    console.error('Error updating batch status:', error);
    throw error;
  }
}

/**
 * Fetch claim records for processing
 */
async function fetchClaimRecords(client: Client, fileId: string, startRow: number, endRow: number) {
  const result = await client.query(`
    SELECT 
      record_id as "recordId",
      file_id as "fileId",
      row_number as "rowNumber",
      mapped_fields as "mappedFields",
      unmapped_fields as "unmappedFields",
      dynamic_fields as "dynamicFields"
    FROM claim_records
    WHERE file_id = $1 AND row_number BETWEEN $2 AND $3
    ORDER BY row_number ASC
  `, [fileId, startRow, endRow]);
  
  return result.rows;
}

/**
 * Process claims with rule processors
 */
async function processClaims(client: Client, claims: any[], processors: any[]) {
  let enriched = 0;
  let failed = 0;
  
  // Process each claim
  for (const claim of claims) {
    try {
      const dynamicFields = claim.dynamicFields || {};
      let claimEnriched = false;
      
      // Apply each rule processor
      for (const processor of processors) {
        try {
          // Check if rule can be applied to this claim
          if (processor.validate(claim)) {
            // Process the claim
            const result = await processor.process(claim);
            
            // If successful, add the enriched data
            if (result.success && result.fieldName && result.fieldValue) {
              dynamicFields[result.fieldName] = result.fieldValue;
              claimEnriched = true;
            }
          }
        } catch (ruleError) {
          // Log rule error but continue with next rule
          console.error(`Error applying rule to claim ${claim.recordId}:`, ruleError);
        }
      }
      
      // Update the claim if any enrichment was applied
      if (claimEnriched) {
        await updateClaimWithEnrichment(client, claim.recordId, dynamicFields);
        enriched++;
      } else {
        failed++;
      }
    } catch (claimError) {
      console.error(`Error processing claim ${claim.recordId}:`, claimError);
      failed++;
    }
  }
  
  return { enriched, failed };
}

/**
 * Update a claim record with enrichment data
 */
async function updateClaimWithEnrichment(client: Client, recordId: string, dynamicFields: any) {
  await client.query(`
    UPDATE claim_records
    SET 
      dynamic_fields = $1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = 'lambda-enrichment'
    WHERE record_id = $2
  `, [JSON.stringify(dynamicFields), recordId]);
}

/**
 * Handle processing error
 */
async function handleProcessingError(client: Client, batchId: string, error: any) {
  const errorDetails = {
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    timestamp: new Date().toISOString(),
    details: error instanceof Error ? error.stack : String(error)
  };
  
  await client.query(`
    UPDATE batch_processing_status
    SET 
      enrichment_status = $1,
      error_details = $2,
      updated_at = CURRENT_TIMESTAMP,
      retry_count = retry_count + 1
    WHERE batch_id = $3
  `, ['ERROR', JSON.stringify(errorDetails), batchId]);
}