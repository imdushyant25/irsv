// File: src/services/claims-processing.ts

import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { downloadFromS3 } from '@/lib/aws/s3';
import { query } from '@/lib/db';
import { 
  FileStatus, 
  ProcessingStage,
  FileRecord 
} from '@/types/file';
import { 
  ProcessingStatus,
  ProcessingProgress 
} from '@/types/claims-processing';
import { DatabaseError } from '@/lib/errors/database';

const BATCH_SIZE = 100; // Process 100 rows at a time

export class ClaimsProcessingService {
  private fileId: string;
  private processingId: string;
  private s3Location: string;

  constructor(fileId: string, processingId: string, s3Location: string) {
    this.fileId = fileId;
    this.processingId = processingId;
    this.s3Location = s3Location;
  }

  async process(): Promise<void> {
    try {
      // Update processing status to PROCESSING
      await this.updateProcessingStatus(ProcessingStatus.PROCESSING);

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

      // Process rows in batches
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await this.processBatch(batch, mapping);
        
        // Update progress
        await this.updateProgress(i + batch.length, totalRows);
      }

      // Update final status
      await this.updateProcessingStatus(ProcessingStatus.COMPLETED);
      await this.updateFileStatus(FileStatus.PROCESSED);

    } catch (error) {
      console.error('Error processing claims:', error);
      await this.handleProcessingError(error);
    }
  }

  private async processBatch(
    rows: any[],
    mapping: Record<string, string>
  ): Promise<void> {
    const client = await query('BEGIN');

    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const claimRecord = this.transformRowToClaim(row, mapping, i + 1);
        
        await query(
          `INSERT INTO claim_records (
            record_id, file_id, row_number, 
            mapped_fields, unmapped_fields,
            validation_status, processing_status,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            claimRecord.recordId,
            this.fileId,
            claimRecord.rowNumber,
            JSON.stringify(claimRecord.mappedFields),
            JSON.stringify(claimRecord.unmappedFields),
            claimRecord.validationStatus,
            claimRecord.processingStatus,
            'system'
          ]
        );
      }

      await query('COMMIT');
    } catch (error) {
      await query('ROLLBACK');
      throw error;
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

  private async updateProgress(processedRows: number, totalRows: number): Promise<void> {
    await query(`
      UPDATE claim_processing_history
      SET 
        processed_rows = $1,
        total_rows = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE processing_id = $3
    `, [processedRows, totalRows, this.processingId]);
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
      details: error
    };

    // Update processing history with error
    await query(`
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
    await this.updateFileStatus(FileStatus.ERROR);
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