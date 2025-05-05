// File: lambda/fileProcessor/index.ts - Enhanced with bulk inserts

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';
import { Pool, PoolClient } from 'pg';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import format from 'pg-format';

// Initialize S3 client
const s3Client = new S3Client({ region: process.env.AWS_REGION });

// Initialize Lambda client
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

// Initialize PostgreSQL connection pool - keep this for the duration of the Lambda
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  },
  max: 5, // Increased for better concurrency 
  idleTimeoutMillis: 120000, // Longer timeout for cold starts
  connectionTimeoutMillis: 10000
});

// Define processing statuses
enum ProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

// Define file statuses
enum FileStatus {
  PROCESSING_CLAIMS = 'PROCESSING_CLAIMS',
  PROCESSED = 'PROCESSED',
  ERROR = 'ERROR'
}

// Define batch processing status values
enum BatchStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  ERROR = 'ERROR'
}

// Define batch enrichment status values
enum BatchEnrichmentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

// Set batch size for processing
const BATCH_SIZE = 1000;

/**
 * Main Lambda handler for file processing
 * @param event The Lambda event containing fileId, processingId, and s3Location
 */
export const handler = async (event: any) => {
  console.log('Starting file processing with event:', JSON.stringify(event));
  
  const { fileId, processingId, s3Location } = event;
  
  // Validate required parameters
  if (!fileId || !processingId || !s3Location) {
    throw new Error('Missing required parameters: fileId, processingId, or s3Location');
  }
  
  try {
    // Update status to PROCESSING - using client instead of pool directly
    const client = await pool.connect();
    try {
      await setSchemaForClient(client);
      await updateProcessingStatusWithClient(client, processingId, ProcessingStatus.PROCESSING);
      client.release();
    } catch (err) {
      client.release();
      throw err;
    }
    
    // Download and parse Excel file from S3
    console.log(`Downloading file from S3: ${s3Location}`);
    const fileBuffer = await downloadFromS3(s3Location);
    
    // Parse Excel file
    console.log('Parsing Excel file');
    const workbook = XLSX.read(fileBuffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: true,
      cellText: true
    });
    
    // Get first worksheet
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Convert to JSON
    const rows = XLSX.utils.sheet_to_json(worksheet);
    const totalRows = rows.length;
    console.log(`Processing ${totalRows} rows from Excel file`);
    
    // Get mapping for file
    const mapping = await getFileMapping(fileId);
    
    // Process rows in batches
    let processedRows = 0;
    
    // Create batches first
    const batches = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batchId = uuidv4();
      const startRow = i + 1; // 1-based row numbering
      const endRow = Math.min(i + BATCH_SIZE, rows.length);
      const batchSize = endRow - startRow + 1;
      
      // Create batch record
      await createBatchRecord(batchId, fileId, startRow, endRow, batchSize);
      
      batches.push({
        batchId,
        startRow,
        endRow,
        rows: rows.slice(i, endRow)
      });
    }
    
    console.log(`Created ${batches.length} batches for processing`);
    
    // Process batches
    for (const batch of batches) {
      try {
        // Process batch
        await processBatch(fileId, batch.rows, mapping, batch.startRow);
        
        // Update batch status
        await updateBatchStatus(batch.batchId, BatchStatus.PROCESSED);
        
        // Invoke enrichment Lambda asynchronously
        await invokeEnrichmentLambda(batch.batchId, fileId, batch.startRow, batch.endRow);
        
        // Update progress
        processedRows += batch.rows.length;
        await updateProgress(processingId, processedRows, totalRows);
        
        console.log(`Processed batch ${batch.batchId} (${batch.startRow}-${batch.endRow}) and triggered enrichment`);
      } catch (error) {
        console.error(`Error processing batch ${batch.batchId}:`, error);
        await updateBatchStatus(batch.batchId, BatchStatus.ERROR, error);
        // Continue with other batches
      }
    }
    
    // Update final status - using client instead of pool directly
    const finalClient = await pool.connect();
    try {
      await setSchemaForClient(finalClient);
      await updateProcessingStatusWithClient(finalClient, processingId, ProcessingStatus.COMPLETED);
      await updateFileStatusWithClient(finalClient, fileId, FileStatus.PROCESSED);
      finalClient.release();
    } catch (err) {
      finalClient.release();
      throw err;
    }
    
    console.log(`Successfully processed ${processedRows} rows for file ${fileId}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'File processing completed successfully',
        fileId,
        processingId,
        processedRows,
        totalRows
      })
    };
  } catch (error) {
    console.error('Error processing file:', error);
    
    // Update error status
    await handleProcessingError(processingId, fileId, error);
    
    // Re-throw the error to be caught by Lambda
    throw error;
  }
  // DO NOT call pool.end() here anymore, as we need to keep the pool alive
  // for the duration of the Lambda execution
};

/**
 * Creates a batch record in the tracking table
 */
async function createBatchRecord(
  batchId: string,
  fileId: string,
  startRow: number,
  endRow: number,
  totalRows: number
): Promise<void> {
  const client = await pool.connect();
  
  try {
    // Set schema first
    await setSchemaForClient(client);
    
    await client.query(`
      INSERT INTO batch_processing_status (
        batch_id, file_id, start_row, end_row, total_rows,
        processing_status, enrichment_status, enrichment_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      batchId,
      fileId,
      startRow,
      endRow,
      totalRows,
      BatchStatus.PENDING,
      BatchEnrichmentStatus.PENDING,
      JSON.stringify({
        basicEnrichmentApplied: true,
        pendingEnrichments: ['drugLookupEnrichment'],
        appliedEnrichments: ['ageEnrichment', 'channelEnrichment']
      })
    ]);
  } finally {
    client.release();
  }
}

/**
 * Updates a batch's processing status
 */
async function updateBatchStatus(
  batchId: string,
  status: BatchStatus,
  error?: any
): Promise<void> {
  const client = await pool.connect();
  
  try {
    // Set schema first
    await setSchemaForClient(client);
    
    const params: any[] = [status];
    let sql = `
      UPDATE batch_processing_status
      SET processing_status = $1
    `;
    
    // Add processed_at timestamp if completed
    if (status === BatchStatus.PROCESSED) {
      sql += `, processed_at = CURRENT_TIMESTAMP`;
    }
    
    // Add error details if there was an error
    if (error) {
      sql += `, error_details = $2`;
      params.push(JSON.stringify({
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : String(error),
        timestamp: new Date().toISOString()
      }));
    }
    
    sql += `, updated_at = CURRENT_TIMESTAMP WHERE batch_id = $${params.length + 1}`;
    params.push(batchId);
    
    await client.query(sql, params);
  } finally {
    client.release();
  }
}

/**
 * Invokes the enrichment Lambda function asynchronously
 */
async function invokeEnrichmentLambda(
  batchId: string,
  fileId: string,
  startRow: number,
  endRow: number
): Promise<void> {
  try {
    const enrichmentLambdaName = process.env.ENRICHMENT_LAMBDA_NAME || 'enrichmentProcessor';
    
    const payload = {
      batchId,
      fileId,
      startRow,
      endRow
    };
    
    const params = {
      FunctionName: enrichmentLambdaName,
      InvocationType: InvocationType.Event, // Asynchronous invocation
      Payload: Buffer.from(JSON.stringify(payload))
    };
    
    const command = new InvokeCommand(params);
    await lambdaClient.send(command);
    
    console.log(`Successfully invoked enrichment Lambda for batch ${batchId}`);
  } catch (error) {
    console.error(`Error invoking enrichment Lambda for batch ${batchId}:`, error);
    // Don't throw, so we can continue processing other batches
  }
}

/**
 * Set schema for a database client connection
 * @param client The database client
 */
async function setSchemaForClient(client: PoolClient): Promise<void> {
  // Check if DB_SCHEMA is defined and set the schema for this connection
  if (process.env.DB_SCHEMA) {
    console.log(`Setting schema to: ${process.env.DB_SCHEMA}`);
    await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
  } else {
    console.warn('DB_SCHEMA environment variable not set');
  }
}

/**
 * Downloads a file from S3
 * @param s3Location The S3 key of the file
 * @returns Buffer containing the file contents
 */
async function downloadFromS3(s3Location: string): Promise<Buffer> {
  const bucketName = process.env.S3_BUCKET_NAME;
  
  const params = {
    Bucket: bucketName,
    Key: s3Location
  };
  
  const command = new GetObjectCommand(params);
  const response = await s3Client.send(command);
  
  // Convert readable stream to buffer
  const chunks: Uint8Array[] = [];
  if (response.Body) {
    // @ts-ignore - StreamBody has a proper async iterator
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
  }
  
  return Buffer.concat(chunks);
}

/**
 * Gets the mapping configuration for a file
 * @param fileId The file ID to get mapping for
 * @returns The mapping configuration as a Record<string, string>
 */
async function getFileMapping(fileId: string): Promise<Record<string, string>> {
  const client = await pool.connect();
  
  try {
    // Set schema first
    await setSchemaForClient(client);

    // SQL query to get mapping
    const sql = `
      SELECT 
        mt.source_column,
        mt.standard_field_id,
        scf.field_name
      FROM template_mappings tm
      JOIN mapping_templates mt ON mt.template_id = tm.id
      JOIN standard_claim_fields scf ON scf.id = mt.standard_field_id
      WHERE tm.file_id = $1 AND tm.is_active = true
    `;
    
    const result = await client.query(sql, [fileId]);
    
    if (result.rows.length === 0) {
      throw new Error(`No mapping found for file ID: ${fileId}`);
    }
    
    // Convert result to mapping object
    const mapping: Record<string, string> = {};
    
    for (const row of result.rows) {
      mapping[row.source_column] = row.field_name;
    }
    
    return mapping;
  } finally {
    client.release();
  }
}

/**
 * Processes a batch of rows
 */
async function processBatch(
  fileId: string, 
  rows: any[], 
  mapping: Record<string, string>,
  startRowNumber: number
): Promise<void> {
  // Process in smaller sub-batches to avoid PostgreSQL parameter limits
  const SUB_BATCH_SIZE = 25;
  
  for (let i = 0; i < rows.length; i += SUB_BATCH_SIZE) {
    const subBatch = rows.slice(i, i + SUB_BATCH_SIZE);
    await processSubBatchBulk(fileId, subBatch, mapping, startRowNumber + i);
  }
}

/**
 * Processes a smaller sub-batch of rows using a bulk insert approach
 */
async function processSubBatchBulk(
  fileId: string,
  rows: any[],
  mapping: Record<string, string>,
  startRowNumber: number
): Promise<void> {
  const client = await pool.connect();
  
  try {
    // Set schema first
    await setSchemaForClient(client);
    
    // Start transaction
    await client.query('BEGIN');
    
    // Create bulk values array for all rows in the sub-batch
    const bulkValues = rows.map((row, i) => {
      const rowNumber = startRowNumber + i;
      const claim = transformRowToClaim(row, mapping, rowNumber);
      
      return [
        claim.recordId,
        fileId,
        claim.rowNumber,
        JSON.stringify(claim.mappedFields),
        JSON.stringify(claim.unmappedFields),
        JSON.stringify(claim.dynamicFields || {}),  // Include dynamic fields, default to empty object
        claim.validationStatus,
        claim.processingStatus,
        'lambda-system'
      ];
    });
    
    // Use pg-format to create a single bulk insert query
    const insertQuery = format(
      `INSERT INTO claim_records (
        record_id, file_id, row_number, 
        mapped_fields, unmapped_fields, dynamic_fields,
        validation_status, processing_status,
        created_by
      ) VALUES %L`,
      bulkValues
    );
    
    // Execute the bulk insert query
    await client.query(insertQuery);
    
    // Commit transaction
    await client.query('COMMIT');
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Release client
    client.release();
  }
}

/**
 * Transforms a row to a claim record
 */
function transformRowToClaim(
  row: any,
  mapping: Record<string, string>,
  rowNumber: number
) {
  const mappedFields: Record<string, any> = {};
  const unmappedFields: Record<string, any> = {};
  const dynamicFields: Record<string, any> = {};

  // Process mapped fields
  for (const [sourceColumn, targetField] of Object.entries(mapping)) {
    let found = false;
    for (const excelHeader in row) {
      if (excelHeader.trim() === sourceColumn) {
        mappedFields[targetField] = row[excelHeader];
        found = true;
        break;
      }
    } 
  }

  // Store unmapped fields
  for (const excelHeader in row) {
    const trimmedHeader = excelHeader.trim();
    if (!Object.keys(mapping).some(sourceCol => sourceCol === trimmedHeader)) {
      unmappedFields[excelHeader] = row[excelHeader];
    }
  }

  // Create the base claim object
  const claim = {
    recordId: uuidv4(),
    rowNumber,
    mappedFields,
    unmappedFields,
    dynamicFields,
    validationStatus: 'PENDING_VALIDATION',
    processingStatus: 'PROCESSED'
  };

  // Apply age rules
  const ageEnrichment = applyAgeRules(claim);
  if (ageEnrichment) {
    dynamicFields['ageEnrichment'] = ageEnrichment;
  }

  // Apply channel rules
  const channelEnrichment = applyChannelRules(claim);
  if (channelEnrichment) {
    dynamicFields['channelEnrichment'] = channelEnrichment;
  }

  // Add dynamic fields to the claim if any enrichments were applied
  if (Object.keys(dynamicFields).length > 0) {
    return {
      ...claim,
      dynamicFields
    };
  }

  return claim;
}

/**
 * Calculate age between two dates
 */
function calculateAge(dob: Date, referenceDate: Date): number {
  let age = referenceDate.getFullYear() - dob.getFullYear();
  const m = referenceDate.getMonth() - dob.getMonth();
  
  if (m < 0 || (m === 0 && referenceDate.getDate() < dob.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Apply age rules to a claim
 */
function applyAgeRules(claim: any): any {
  try {
    // Check if required fields exist
    if (!claim.mappedFields.member_dob || !claim.mappedFields.fill_date) {
      return null;
    }

    // Parse dates
    const dob = new Date(claim.mappedFields.member_dob);
    const fillDate = new Date(claim.mappedFields.fill_date);
    const currentDate = new Date();

    // Validate dates
    if (isNaN(dob.getTime()) || isNaN(fillDate.getTime())) {
      return null;
    }

    // Calculate ages
    const ageAtFillDate = calculateAge(dob, fillDate);
    const currentAge = calculateAge(dob, currentDate);

    // Return the enrichment data
    return {
      currentAge,
      ageAtFillDate,
      isUnder65AtFillDate: ageAtFillDate < 65,
      isUnder65AtCurrentDate: currentAge < 65
    };
  } catch (error) {
    console.error('Error applying age rules:', error);
    return null;
  }
}

/**
 * Apply channel rules to a claim
 */
function applyChannelRules(claim: any): any {
  try {
    // Check if required fields exist and there's no existing channel_indicator
    if (!claim.mappedFields.days_supply || claim.mappedFields.channel_indicator) {
      return null;
    }
    
    // Parse days_supply as a number
    const daysSupply = Number(claim.mappedFields.days_supply);
    
    // Validate days_supply
    if (isNaN(daysSupply) || daysSupply <= 0) {
      return null;
    }
    
    // Determine channel based on days_supply
    let channel: string;
    if (daysSupply > 83) {
      channel = "Mail";
    } else if (daysSupply <= 30) {
      channel = "Retail";
    } else {
      // For values between 31-83, we consider it Retail90
      channel = "Retail90";
    }
    
    // Return the enrichment data
    return {
      channel_indicator: channel,
      derived_from_days_supply: daysSupply
    };
  } catch (error) {
    console.error('Error applying channel rules:', error);
    return null;
  }
}

/**
 * Updates the processing status using a provided client
 * @param client The database client
 * @param processingId The processing ID
 * @param status The new status
 */
async function updateProcessingStatusWithClient(
  client: PoolClient, 
  processingId: string, 
  status: ProcessingStatus
): Promise<void> {
  const sql = `
    UPDATE claim_processing_history
    SET 
      status = $1,
      ${status === ProcessingStatus.COMPLETED ? 'end_time = CURRENT_TIMESTAMP,' : ''}
      updated_at = CURRENT_TIMESTAMP
    WHERE processing_id = $2
  `;
  
  await client.query(sql, [status, processingId]);
}

/**
 * Updates the processing status
 * @param processingId The processing ID
 * @param status The new status
 */
async function updateProcessingStatus(
  processingId: string, 
  status: ProcessingStatus
): Promise<void> {
  const client = await pool.connect();
  try {
    // Set schema first
    await setSchemaForClient(client);
    
    await updateProcessingStatusWithClient(client, processingId, status);
  } finally {
    client.release();
  }
}

/**
 * Updates the progress of processing
 * @param processingId The processing ID
 * @param processedRows The number of processed rows
 * @param totalRows The total number of rows
 */
async function updateProgress(
  processingId: string,
  processedRows: number,
  totalRows: number
): Promise<void> {
  const client = await pool.connect();
  try {
    // Set schema first
    await setSchemaForClient(client);
    
    const sql = `
      UPDATE claim_processing_history
      SET 
        processed_rows = $1,
        total_rows = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE processing_id = $3
    `;
    
    await client.query(sql, [processedRows, totalRows, processingId]);
  } finally {
    client.release();
  }
}

/**
 * Updates the file status using a provided client
 * @param client The database client
 * @param fileId The file ID
 * @param status The new status
 */
async function updateFileStatusWithClient(
  client: PoolClient,
  fileId: string,
  status: FileStatus
): Promise<void> {
  const sql = `
    UPDATE claims_file_registry
    SET 
      status = $1,
      updated_at = CURRENT_TIMESTAMP,
      updated_by = 'lambda-system'
    WHERE file_id = $2
  `;
  
  await client.query(sql, [status, fileId]);
}

/**
 * Updates the file status
 * @param fileId The file ID
 * @param status The new status
 */
async function updateFileStatus(
  fileId: string,
  status: FileStatus
): Promise<void> {
  const client = await pool.connect();
  try {
    // Set schema first
    await setSchemaForClient(client);
    
    await updateFileStatusWithClient(client, fileId, status);
  } finally {
    client.release();
  }
}

/**
 * Handles processing errors
 * @param processingId The processing ID
 * @param fileId The file ID
 * @param error The error
 */
async function handleProcessingError(
  processingId: string,
  fileId: string,
  error: any
): Promise<void> {
  const errorDetails = {
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    timestamp: new Date().toISOString(),
    details: error instanceof Error ? error.stack : String(error)
  };

  const client = await pool.connect();
  try {
    // Set schema first
    await setSchemaForClient(client);
    
    // Start transaction
    await client.query('BEGIN');

    // Update processing history with error
    await client.query(
      `UPDATE claim_processing_history
      SET 
        status = $1,
        error_details = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE processing_id = $3`,
      [ProcessingStatus.ERROR, JSON.stringify(errorDetails), processingId]
    );
    
    // Update file status to ERROR
    await client.query(
      `UPDATE claims_file_registry
      SET 
        status = $1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = 'lambda-system'
      WHERE file_id = $2`,
      [FileStatus.ERROR, fileId]
    );

    // Commit transaction
    await client.query('COMMIT');
  } catch (dbError) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Failed to update error status:', dbError);
  } finally {
    client.release();
  }
}