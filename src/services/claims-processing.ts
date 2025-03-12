// File: src/services/claims-processing.ts

import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { downloadFromS3 } from '@/lib/aws/s3';
import { query, pool } from '@/lib/db';
import { 
  FileStatus, 
  ProcessingStage,
  FileRecord 
} from '@/types/file';
import { 
  ProcessingStatus,
  ProcessingProgress 
} from '@/types/claims-processing';


const BATCH_SIZE = 500; // Process 500 rows at a time

export class ClaimsProcessingService {
  private fileId: string;
  private processingId: string;
  private s3Location: string;
  private startTime: number;

  constructor(fileId: string, processingId: string, s3Location: string) {
    this.fileId = fileId;
    this.processingId = processingId;
    this.s3Location = s3Location;
    this.startTime = Date.now();
  }

  async process(): Promise<void> {
    try {
      // Update processing status to PROCESSING
      await this.updateProcessingStatus(ProcessingStatus.PROCESSING);
      this.startTime = Date.now();
  
      // Get mapping configuration
      const mapping = await this.getFileMapping();
      if (!mapping) {
        throw new Error('No mapping configuration found for file');
      }
  
      // Download and parse Excel file
      const fileBuffer = await downloadFromS3(this.s3Location);
      const workbook = XLSX.read(fileBuffer, {
        type: 'buffer',
        cellDates: true,
        cellNF: true,
        cellText: true
      });
  
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet);
      const totalRows = rows.length;
      
      console.log(`Processing ${totalRows} rows with batch size ${BATCH_SIZE}`);
  
      // Process rows in batches
      let processedRows = 0;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        try {
          const endIdx = Math.min(i + BATCH_SIZE, rows.length);
          const batch = rows.slice(i, endIdx);
          await this.processBatch(batch, mapping);
          
          // Update progress
          processedRows += batch.length;
          await this.updateProgress(processedRows, totalRows);
          console.log(`Processed ${processedRows} of ${totalRows} rows`);
        } catch (batchError) {
          console.error(`Error processing batch starting at row ${i}:`, batchError);
          // Continue with next batch instead of failing entire process
        }
      }
  
      // Update final status
      if (processedRows === totalRows) {
        await this.updateProcessingStatus(ProcessingStatus.COMPLETED);
        await this.updateFileStatus(FileStatus.PROCESSED);
      } else if (processedRows > 0) {
        // Partial success
        await this.updateProcessingStatus(ProcessingStatus.COMPLETED);
        await this.updateFileStatus(FileStatus.PROCESSED);
        console.warn(`Processed ${processedRows} out of ${totalRows} rows with some errors`);
      } else {
        // Complete failure
        throw new Error(`Failed to process any rows out of ${totalRows}`);
      }
  
    } catch (error) {
      console.error('Error processing claims:', error);
      await this.handleProcessingError(error);
    }
  }

  /**
 * Process a batch of rows
 */
  private async processBatch(
    rows: any[],
    mapping: Record<string, string>
  ): Promise<void> {
    // Process in smaller sub-batches to avoid PostgreSQL parameter limits
    const SUB_BATCH_SIZE = 25; // Much smaller than the default 500
    
    for (let i = 0; i < rows.length; i += SUB_BATCH_SIZE) {
      const subBatch = rows.slice(i, i + SUB_BATCH_SIZE);
      await this.processSubBatch(subBatch, mapping);
    }
  }
  
  /**
   * Process a smaller sub-batch of rows
   */
  private async processSubBatch(
    rows: any[],
    mapping: Record<string, string>
  ): Promise<void> {
    // Create a new client for each sub-batch to avoid transaction issues
    const client = await pool.connect();
    
    try {
      // Start transaction
      await client.query('BEGIN');
      
      // Insert rows one by one to avoid parameter limits
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const claim = this.transformRowToClaim(row, mapping, i + 1);
        
        await client.query(
          `INSERT INTO claim_records (
            record_id, file_id, row_number, 
            mapped_fields, unmapped_fields,
            validation_status, processing_status,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            claim.recordId,
            this.fileId,
            claim.rowNumber,
            JSON.stringify(claim.mappedFields),
            JSON.stringify(claim.unmappedFields),
            claim.validationStatus,
            claim.processingStatus,
            'system'
          ]
        );
      }
      
      // Commit transaction
      await client.query('COMMIT');
      
    } catch (error) {
      // Rollback on error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
      
      throw error;
    } finally {
      // Always release the client
      client.release();
    }
  }

  private transformRowToClaim(
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

  private async getFileMapping(): Promise<Record<string, string> | null> {
    const result = await query(`
      SELECT 
        mt.source_column,
        mt.standard_field_id,
        scf.field_name
      FROM template_mappings tm
      JOIN mapping_templates mt ON mt.template_id = tm.id
      JOIN standard_claim_fields scf ON scf.id = mt.standard_field_id
      WHERE tm.file_id = $1 AND tm.is_active = true
    `, [this.fileId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows.reduce((acc: Record<string, string>, row) => {
      acc[row.source_column] = row.field_name;
      return acc;
    }, {});
  }

  private async updateProcessingStatus(status: ProcessingStatus): Promise<void> {
    await query(`
      UPDATE claim_processing_history
      SET 
        status = $1,
        ${status === ProcessingStatus.COMPLETED ? 'end_time = CURRENT_TIMESTAMP,' : ''}
        updated_at = CURRENT_TIMESTAMP
      WHERE processing_id = $2
    `, [status, this.processingId]);
  }

  private async updateProgress(
    processedRows: number,
    totalRows: number,
    batchTime?: number // Make this parameter optional
  ): Promise<void> {
    // Calculate performance metrics
    const currentTime = Date.now();
    const elapsedTimeMs = currentTime - this.startTime;
    const rowsPerSecond = processedRows / (elapsedTimeMs / 1000 || 1); // Avoid division by zero
    const estimatedTimeRemaining = (totalRows - processedRows) / (rowsPerSecond || 1); // Avoid division by zero
    
    // For existing database schema - if you don't yet have the performance_metrics column
    await query(`
      UPDATE claim_processing_history
      SET 
        processed_rows = $1,
        total_rows = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE processing_id = $3
    `, [processedRows, totalRows, this.processingId]);
    
    // Optional logging of performance metrics
    console.log(`Processing progress: ${processedRows}/${totalRows} rows (${Math.round(rowsPerSecond)} rows/sec, ETA: ${Math.round(estimatedTimeRemaining)}s)`);
    
    // If you have batch time information, log it
    if (batchTime) {
      console.log(`Last batch processing time: ${batchTime}ms (${Math.round(BATCH_SIZE / (batchTime / 1000))} rows/sec)`);
    }
  }

  private async updateFileStatus(status: FileStatus): Promise<void> {
    await query(`
      UPDATE claims_file_registry
      SET 
        status = $1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = 'system'
      WHERE file_id = $2
    `, [status, this.fileId]);
  }

  private async handleProcessingError(error: unknown): Promise<void> {
    const errorDetails = {
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString(),
      details: error instanceof Error ? error.stack : String(error)
    };
  
    // Update processing history with error - use a new client
    const client = await pool.connect();
    try {
      await client.query(`
        UPDATE claim_processing_history
        SET 
          status = $1,
          error_details = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE processing_id = $3
      `, [
        ProcessingStatus.ERROR,
        JSON.stringify(errorDetails),
        this.processingId
      ]);
      
      // Update file status to ERROR
      await client.query(`
        UPDATE claims_file_registry
        SET 
          status = $1,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = 'system'
        WHERE file_id = $2
      `, [FileStatus.ERROR, this.fileId]);
    } catch (dbError) {
      console.error('Failed to update error status:', dbError);
    } finally {
      client.release();
    }
  }

}

// Factory function for creating service instances
export function createClaimsProcessor(
  fileId: string,
  processingId: string,
  s3Location: string
): ClaimsProcessingService {
  return new ClaimsProcessingService(fileId, processingId, s3Location);
}