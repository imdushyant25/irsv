// File: lambda/enrichmentProcessor/index.ts

import { Pool, Client } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { ruleProcessors } from './processors';

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

// Define status enums as string literals to ensure type safety
enum BatchEnrichmentStatus {
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
    await updateBatchEnrichmentStatus(client, batchId, BatchEnrichmentStatus.PROCESSING);
    
    // Fetch the batch information from database
    const batchInfo = await getBatchInfo(client, batchId);
    
    // Verify batch is in the correct state for processing
    if (batchInfo.processing_status !== 'PROCESSED') {
      throw new Error(`Batch ${batchId} is not ready for enrichment, current status: ${batchInfo.processing_status}`);
    }
    
    // Fetch claims for this batch
    const claims = await fetchClaimRecords(client, fileId, startRow, endRow);
    console.log(`Processing ${claims.length} claims for batch ${batchId}`);
    
    // Process each claim with rule processors
    const results = await processClaims(client, claims, ruleProcessors);
    
    // Update batch status to COMPLETED
    await updateBatchEnrichmentStatus(client, batchId, BatchEnrichmentStatus.COMPLETED, {
      totalProcessed: claims.length,
      enriched: results.enriched,
      failed: results.failed,
      ruleStats: results.ruleStats
    });
    
    // Check if all batches for this file are complete
    await checkFileEnrichmentCompletion(client, fileId);
    
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
 * Update batch enrichment status in the database
 */
async function updateBatchEnrichmentStatus(
  client: Client, 
  batchId: string, 
  status: BatchEnrichmentStatus, 
  details?: any
) {
  const params: any[] = [status];
  let paramIndex = 2;
  const updateFields = ['enrichment_status = $1', 'updated_at = CURRENT_TIMESTAMP'];
  
  if (status === BatchEnrichmentStatus.COMPLETED) {
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
 * Check if all batches for a file have been enriched and update file status if needed
 */
async function checkFileEnrichmentCompletion(client: Client, fileId: string) {
  try {
    // Count total and completed batches
    const batchesResult = await client.query(`
      SELECT 
        COUNT(*) as total_batches,
        SUM(CASE WHEN enrichment_status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_batches,
        SUM(CASE WHEN enrichment_status = 'ERROR' THEN 1 ELSE 0 END) as error_batches
      FROM batch_processing_status
      WHERE file_id = $1
    `, [fileId]);
    
    const { total_batches, completed_batches, error_batches } = batchesResult.rows[0];
    
    // If all batches are either completed or in error state
    if (parseInt(total_batches) > 0 && parseInt(completed_batches) + parseInt(error_batches) === parseInt(total_batches)) {
      console.log(`All batches processed for file ${fileId}: ${completed_batches} completed, ${error_batches} failed`);
      
      // If at least some batches were enriched successfully, mark the file as ENRICHED
      if (parseInt(completed_batches) > 0) {
        await client.query(`
          UPDATE claims_file_registry
          SET 
            status = 'ENRICHED',
            updated_at = CURRENT_TIMESTAMP,
            updated_by = 'system'
          WHERE file_id = $1
        `, [fileId]);
        console.log(`File ${fileId} status updated to ENRICHED`);
      }
    }
  } catch (error) {
    console.error(`Error checking file completion status: ${error}`);
    // Don't throw here to avoid failing the batch processing
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
  
  // Track rule application stats
  const ruleStats = new Map();
  processors.forEach(processor => {
    ruleStats.set(processor.ruleId, {
      ruleId: processor.ruleId,
      name: processor.name,
      attempted: 0,
      succeeded: 0
    });
  });
  
  // Process each claim
  for (const claim of claims) {
    try {
      const dynamicFields = claim.dynamicFields || {};
      let claimEnriched = false;
      
      // Apply each rule processor
      for (const processor of processors) {
        try {
          // Track attempt
          const stats = ruleStats.get(processor.ruleId);
          if (stats) {
            stats.attempted++;
          }
          
          // Check if rule can be applied to this claim
          if (processor.validate(claim)) {
            // Process the claim
            const result = await processor.process(claim);
            
            // If successful, add the enriched data
            if (result.success && result.fieldName && result.fieldValue) {
              dynamicFields[result.fieldName] = result.fieldValue;
              claimEnriched = true;
              
              // Track success
              if (stats) {
                stats.succeeded++;
              }
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
  
  // Convert rule stats map to array for reporting
  const ruleStatsArray = Array.from(ruleStats.values()).map(stats => ({
    ...stats,
    successRate: stats.attempted > 0 ? (stats.succeeded / stats.attempted) * 100 : 0
  }));
  
  return { enriched, failed, ruleStats: ruleStatsArray };
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
  `, [BatchEnrichmentStatus.ERROR, JSON.stringify(errorDetails), batchId]);
}