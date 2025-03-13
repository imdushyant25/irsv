// File: lambda/fileProcessor/index.ts

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Pool } from 'pg';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

// Initialize S3 client
const s3Client = new S3Client({ region: process.env.AWS_REGION });

// Initialize PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  },
  // Connection pool settings optimized for Lambda
  max: 1, // Lambda functions are single-threaded
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
    // Update status to PROCESSING
    await updateProcessingStatus(processingId, ProcessingStatus.PROCESSING);
    
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
    const BATCH_SIZE = 100;
    let processedRows = 0;
    
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, Math.min(i + BATCH_SIZE, rows.length));
      await processBatch(fileId, batch, mapping);
      
      // Update progress
      processedRows += batch.length;
      await updateProgress(processingId, processedRows, totalRows);
    }
    
    // Update final status
    await updateProcessingStatus(processingId, ProcessingStatus.COMPLETED);
    await updateFileStatus(fileId, FileStatus.PROCESSED);
    
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
  } finally {
    // Close pool after processing is complete
    await pool.end();
  }
};

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
 * Set schema for a database client connection
 * @param client The database client
 */
async function setSchemaForClient(client: any): Promise<void> {
  // Check if DB_SCHEMA is defined and set the schema for this connection
  if (process.env.DB_SCHEMA) {
    console.log(`Setting schema to: ${process.env.DB_SCHEMA}`);
    await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
  } else {
    console.warn('DB_SCHEMA environment variable not set');
  }
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
 * @param fileId The file ID
 * @param rows The rows to process
 * @param mapping The mapping configuration
 */
async function processBatch(
  fileId: string, 
  rows: any[], 
  mapping: Record<string, string>
): Promise<void> {
  // Process rows in smaller sub-batches for better database performance
  const SUB_BATCH_SIZE = 25;
  
  for (let i = 0; i < rows.length; i += SUB_BATCH_SIZE) {
    const subBatch = rows.slice(i, i + SUB_BATCH_SIZE);
    await processSubBatch(fileId, subBatch, mapping);
  }
}

/**
 * Processes a sub-batch of rows
 * @param fileId The file ID
 * @param rows The rows to process
 * @param mapping The mapping configuration
 */
async function processSubBatch(
  fileId: string,
  rows: any[],
  mapping: Record<string, string>
): Promise<void> {
  const client = await pool.connect();
  
  try {
    // Set schema first
    await setSchemaForClient(client);
    
    // Start transaction
    await client.query('BEGIN');
    
    // Process each row
    for (const row of rows) {
      const rowNumber = rows.indexOf(row) + 1;
      const claim = transformRowToClaim(row, mapping, rowNumber);
      
      // Insert the claim record
      await client.query(
        `INSERT INTO claim_records (
          record_id, file_id, row_number, 
          mapped_fields, unmapped_fields,
          validation_status, processing_status,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          claim.recordId,
          fileId,
          claim.rowNumber,
          JSON.stringify(claim.mappedFields),
          JSON.stringify(claim.unmappedFields),
          claim.validationStatus,
          claim.processingStatus,
          'lambda-system'
        ]
      );
    }
    
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
 * @param row The row data
 * @param mapping The mapping configuration
 * @param rowNumber The row number
 * @returns The transformed claim record
 */
function transformRowToClaim(
  row: any,
  mapping: Record<string, string>,
  rowNumber: number
) {
  const mappedFields: Record<string, any> = {};
  const unmappedFields: Record<string, any> = {};

  // Process mapped fields
  for (const [sourceColumn, targetField] of Object.entries(mapping)) {
    if (row[sourceColumn] !== undefined) {
      mappedFields[targetField] = row[sourceColumn];
    }
  }

  // Store unmapped fields
  for (const [column, value] of Object.entries(row)) {
    if (!Object.keys(mapping).includes(column)) {
      unmappedFields[column] = value;
    }
  }

  return {
    recordId: uuidv4(),
    rowNumber,
    mappedFields,
    unmappedFields,
    validationStatus: 'PENDING_VALIDATION',
    processingStatus: 'PROCESSED'
  };
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
    
    const sql = `
      UPDATE claim_processing_history
      SET 
        status = $1,
        ${status === ProcessingStatus.COMPLETED ? 'end_time = CURRENT_TIMESTAMP,' : ''}
        updated_at = CURRENT_TIMESTAMP
      WHERE processing_id = $2
    `;
    
    await client.query(sql, [status, processingId]);
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
        updated_at = CURRENT_TIMESTAMP
      WHERE processing_id = $2
    `;
    
    await client.query(sql, [processedRows, processingId]);
  } finally {
    client.release();
  }
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
    
    const sql = `
      UPDATE claims_file_registry
      SET 
        status = $1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = 'lambda-system'
      WHERE file_id = $2
    `;
    
    await client.query(sql, [status, fileId]);
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