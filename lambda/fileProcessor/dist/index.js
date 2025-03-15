"use strict";
// File: lambda/fileProcessor/index.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const client_lambda_1 = require("@aws-sdk/client-lambda");
const pg_1 = require("pg");
const XLSX = __importStar(require("xlsx"));
const uuid_1 = require("uuid");
// Initialize S3 client
const s3Client = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
// Initialize Lambda client
const lambdaClient = new client_lambda_1.LambdaClient({ region: process.env.AWS_REGION });
// Initialize PostgreSQL connection pool - keep this for the duration of the Lambda
const pool = new pg_1.Pool({
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
var ProcessingStatus;
(function (ProcessingStatus) {
    ProcessingStatus["PENDING"] = "PENDING";
    ProcessingStatus["PROCESSING"] = "PROCESSING";
    ProcessingStatus["COMPLETED"] = "COMPLETED";
    ProcessingStatus["ERROR"] = "ERROR";
})(ProcessingStatus || (ProcessingStatus = {}));
// Define file statuses
var FileStatus;
(function (FileStatus) {
    FileStatus["PROCESSING_CLAIMS"] = "PROCESSING_CLAIMS";
    FileStatus["PROCESSED"] = "PROCESSED";
    FileStatus["ERROR"] = "ERROR";
})(FileStatus || (FileStatus = {}));
// Define batch processing status values
var BatchStatus;
(function (BatchStatus) {
    BatchStatus["PENDING"] = "PENDING";
    BatchStatus["PROCESSING"] = "PROCESSING";
    BatchStatus["PROCESSED"] = "PROCESSED";
    BatchStatus["ERROR"] = "ERROR";
})(BatchStatus || (BatchStatus = {}));
// Define batch enrichment status values
var BatchEnrichmentStatus;
(function (BatchEnrichmentStatus) {
    BatchEnrichmentStatus["PENDING"] = "PENDING";
    BatchEnrichmentStatus["PROCESSING"] = "PROCESSING";
    BatchEnrichmentStatus["COMPLETED"] = "COMPLETED";
    BatchEnrichmentStatus["ERROR"] = "ERROR";
})(BatchEnrichmentStatus || (BatchEnrichmentStatus = {}));
// Set batch size for processing
const BATCH_SIZE = 100;
/**
 * Main Lambda handler for file processing
 * @param event The Lambda event containing fileId, processingId, and s3Location
 */
const handler = async (event) => {
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
        }
        catch (err) {
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
            const batchId = (0, uuid_1.v4)();
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
            }
            catch (error) {
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
        }
        catch (err) {
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
    }
    catch (error) {
        console.error('Error processing file:', error);
        // Update error status
        await handleProcessingError(processingId, fileId, error);
        // Re-throw the error to be caught by Lambda
        throw error;
    }
    // DO NOT call pool.end() here anymore, as we need to keep the pool alive
    // for the duration of the Lambda execution
};
exports.handler = handler;
/**
 * Creates a batch record in the tracking table
 */
async function createBatchRecord(batchId, fileId, startRow, endRow, totalRows) {
    const client = await pool.connect();
    try {
        // Set schema first
        await setSchemaForClient(client);
        await client.query(`
      INSERT INTO batch_processing_status (
        batch_id, file_id, start_row, end_row, total_rows,
        processing_status, enrichment_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
            batchId,
            fileId,
            startRow,
            endRow,
            totalRows,
            BatchStatus.PENDING,
            BatchEnrichmentStatus.PENDING
        ]);
    }
    finally {
        client.release();
    }
}
/**
 * Updates a batch's processing status
 */
async function updateBatchStatus(batchId, status, error) {
    const client = await pool.connect();
    try {
        // Set schema first
        await setSchemaForClient(client);
        const params = [status];
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
    }
    finally {
        client.release();
    }
}
/**
 * Invokes the enrichment Lambda function asynchronously
 */
async function invokeEnrichmentLambda(batchId, fileId, startRow, endRow) {
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
            InvocationType: client_lambda_1.InvocationType.Event, // Asynchronous invocation
            Payload: Buffer.from(JSON.stringify(payload))
        };
        const command = new client_lambda_1.InvokeCommand(params);
        await lambdaClient.send(command);
        console.log(`Successfully invoked enrichment Lambda for batch ${batchId}`);
    }
    catch (error) {
        console.error(`Error invoking enrichment Lambda for batch ${batchId}:`, error);
        // Don't throw, so we can continue processing other batches
    }
}
/**
 * Set schema for a database client connection
 * @param client The database client
 */
async function setSchemaForClient(client) {
    // Check if DB_SCHEMA is defined and set the schema for this connection
    if (process.env.DB_SCHEMA) {
        console.log(`Setting schema to: ${process.env.DB_SCHEMA}`);
        await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
    }
    else {
        console.warn('DB_SCHEMA environment variable not set');
    }
}
/**
 * Downloads a file from S3
 * @param s3Location The S3 key of the file
 * @returns Buffer containing the file contents
 */
async function downloadFromS3(s3Location) {
    const bucketName = process.env.S3_BUCKET_NAME;
    const params = {
        Bucket: bucketName,
        Key: s3Location
    };
    const command = new client_s3_1.GetObjectCommand(params);
    const response = await s3Client.send(command);
    // Convert readable stream to buffer
    const chunks = [];
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
async function getFileMapping(fileId) {
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
        const mapping = {};
        for (const row of result.rows) {
            mapping[row.source_column] = row.field_name;
        }
        return mapping;
    }
    finally {
        client.release();
    }
}
/**
 * Processes a batch of rows
 */
async function processBatch(fileId, rows, mapping, startRowNumber) {
    // Process in smaller sub-batches to avoid PostgreSQL parameter limits
    const SUB_BATCH_SIZE = 25;
    for (let i = 0; i < rows.length; i += SUB_BATCH_SIZE) {
        const subBatch = rows.slice(i, i + SUB_BATCH_SIZE);
        await processSubBatch(fileId, subBatch, mapping, startRowNumber + i);
    }
}
/**
 * Processes a smaller sub-batch of rows
 */
async function processSubBatch(fileId, rows, mapping, startRowNumber) {
    const client = await pool.connect();
    try {
        // Set schema first
        await setSchemaForClient(client);
        // Start transaction
        await client.query('BEGIN');
        // Process each row in the sub-batch
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = startRowNumber + i;
            const claim = transformRowToClaim(row, mapping, rowNumber);
            // Insert the claim record
            await client.query(`INSERT INTO claim_records (
          record_id, file_id, row_number, 
          mapped_fields, unmapped_fields,
          validation_status, processing_status,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                claim.recordId,
                fileId,
                claim.rowNumber,
                JSON.stringify(claim.mappedFields),
                JSON.stringify(claim.unmappedFields),
                claim.validationStatus,
                claim.processingStatus,
                'lambda-system'
            ]);
        }
        // Commit transaction
        await client.query('COMMIT');
    }
    catch (error) {
        // Rollback on error
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        // Release client
        client.release();
    }
}
/**
 * Transforms a row to a claim record
 */
function transformRowToClaim(row, mapping, rowNumber) {
    const mappedFields = {};
    const unmappedFields = {};
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
        recordId: (0, uuid_1.v4)(),
        rowNumber,
        mappedFields,
        unmappedFields,
        validationStatus: 'PENDING_VALIDATION',
        processingStatus: 'PROCESSED'
    };
}
/**
 * Updates the processing status using a provided client
 * @param client The database client
 * @param processingId The processing ID
 * @param status The new status
 */
async function updateProcessingStatusWithClient(client, processingId, status) {
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
async function updateProcessingStatus(processingId, status) {
    const client = await pool.connect();
    try {
        // Set schema first
        await setSchemaForClient(client);
        await updateProcessingStatusWithClient(client, processingId, status);
    }
    finally {
        client.release();
    }
}
/**
 * Updates the progress of processing
 * @param processingId The processing ID
 * @param processedRows The number of processed rows
 * @param totalRows The total number of rows
 */
async function updateProgress(processingId, processedRows, totalRows) {
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
    }
    finally {
        client.release();
    }
}
/**
 * Updates the file status using a provided client
 * @param client The database client
 * @param fileId The file ID
 * @param status The new status
 */
async function updateFileStatusWithClient(client, fileId, status) {
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
async function updateFileStatus(fileId, status) {
    const client = await pool.connect();
    try {
        // Set schema first
        await setSchemaForClient(client);
        await updateFileStatusWithClient(client, fileId, status);
    }
    finally {
        client.release();
    }
}
/**
 * Handles processing errors
 * @param processingId The processing ID
 * @param fileId The file ID
 * @param error The error
 */
async function handleProcessingError(processingId, fileId, error) {
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
        await client.query(`UPDATE claim_processing_history
      SET 
        status = $1,
        error_details = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE processing_id = $3`, [ProcessingStatus.ERROR, JSON.stringify(errorDetails), processingId]);
        // Update file status to ERROR
        await client.query(`UPDATE claims_file_registry
      SET 
        status = $1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = 'lambda-system'
      WHERE file_id = $2`, [FileStatus.ERROR, fileId]);
        // Commit transaction
        await client.query('COMMIT');
    }
    catch (dbError) {
        // Rollback on error
        await client.query('ROLLBACK');
        console.error('Failed to update error status:', dbError);
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=index.js.map