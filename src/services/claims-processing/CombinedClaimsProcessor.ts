// File: src/services/claims-processing/CombinedClaimsProcessor.ts

import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { downloadFromS3 } from '@/lib/aws/s3';
import { query, pool } from '@/lib/db';
import { FileStatus, ProcessingStage } from '@/types/file';
import { ProcessingStatus } from '@/types/claims-processing';
import { EnrichmentRuleProcessor } from '@/types/enrichment';
import { enrichmentRuleRegistry } from '@/services/enrichment/EnrichmentRuleRegistry';

// Process data in smaller batches to avoid memory issues
const BATCH_SIZE = 250;

export class CombinedClaimsProcessor {
  private fileId: string;
  private processingId: string;
  private s3Location: string;
  private userId: string;
  private enrichmentRules: EnrichmentRuleProcessor[] = [];
  private startTime: number;
  private totalRows: number = 0;
  private processedRows: number = 0;
  private failedRows: number = 0;
  private enrichedRows: number = 0;

  constructor(fileId: string, processingId: string, s3Location: string, userId: string = 'system') {
    this.fileId = fileId;
    this.processingId = processingId;
    this.s3Location = s3Location;
    this.userId = userId;
    this.startTime = Date.now();
  }

  /**
   * Main processing method that handles both claims processing and enrichment
   */
  async process(): Promise<void> {
    try {
      // Update processing status to PROCESSING_COMBINED
      await this.updateProcessingStatus(ProcessingStatus.PROCESSING);
      
      // Initialize enrichment rules
      await this.initializeEnrichmentRules();
      
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
      this.totalRows = rows.length;
      
      console.log(`Combined processing ${this.totalRows} rows with batch size ${BATCH_SIZE}`);

      // Process rows in batches
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        try {
          const endIdx = Math.min(i + BATCH_SIZE, rows.length);
          const batch = rows.slice(i, endIdx);
          await this.processBatchWithEnrichment(batch, mapping);
          
          // Update progress
          this.processedRows += batch.length;
          await this.updateProgress();
          console.log(`Processed ${this.processedRows} of ${this.totalRows} rows (${this.enrichedRows} enriched)`);
        } catch (batchError) {
          console.error(`Error processing batch starting at row ${i}:`, batchError);
          // Continue with next batch instead of failing entire process
        }
      }

      // Update final status
      if (this.processedRows === this.totalRows) {
        await this.updateProcessingStatus(ProcessingStatus.COMPLETED);
        await this.updateFileStatus(FileStatus.ENRICHED);
      } else if (this.processedRows > 0) {
        // Partial success
        await this.updateProcessingStatus(ProcessingStatus.COMPLETED);
        await this.updateFileStatus(FileStatus.ENRICHED);
        console.warn(`Processed ${this.processedRows} out of ${this.totalRows} rows with some errors`);
      } else {
        // Complete failure
        throw new Error(`Failed to process any rows out of ${this.totalRows}`);
      }

    } catch (error) {
      console.error('Error during combined processing:', error);
      await this.handleProcessingError(error);
    }
  }

  /**
   * Initialize enrichment rules from registry
   */
  private async initializeEnrichmentRules(): Promise<void> {
    try {
      // Ensure registry is initialized
      if (!enrichmentRuleRegistry.isInitialized()) {
        await enrichmentRuleRegistry.loadRules();
      }

      // Get active processors
      this.enrichmentRules = enrichmentRuleRegistry.getProcessors();
      
      // If no processors are registered, register defaults
      if (this.enrichmentRules.length === 0) {
        console.warn('No active enrichment rule processors found - registering defaults');
        const { registerRuleProcessors } = await import('@/services/enrichment/rules');
        registerRuleProcessors();
        this.enrichmentRules = enrichmentRuleRegistry.getProcessors();
      }

      console.log(`Initialized ${this.enrichmentRules.length} enrichment rule processors`);
    } catch (error) {
      console.error('Error initializing enrichment rules:', error);
      // Don't stop processing if enrichment setup fails - we'll still process claims
    }
  }

  /**
   * Process a batch of rows with enrichment
   */
  private async processBatchWithEnrichment(
    rows: any[],
    mapping: Record<string, string>
  ): Promise<void> {
    // Process in smaller sub-batches to avoid PostgreSQL parameter limits
    const SUB_BATCH_SIZE = 25;
    
    for (let i = 0; i < rows.length; i += SUB_BATCH_SIZE) {
      const subBatch = rows.slice(i, i + SUB_BATCH_SIZE);
      await this.processSubBatchWithEnrichment(subBatch, mapping);
    }
  }

  /**
   * Process a smaller sub-batch of rows with enrichment
   */
  private async processSubBatchWithEnrichment(
    rows: any[],
    mapping: Record<string, string>
  ): Promise<void> {
    // Create a new client for each sub-batch to avoid transaction issues
    const client = await pool.connect();
    
    try {
      // Start transaction
      await client.query('BEGIN');
      
      // Track enrichment statistics
      const ruleApplicationStats = new Map<string, { 
        attempted: number, 
        succeeded: number,
        fieldName: string
      }>();
      
      // Initialize stats for each processor
      this.enrichmentRules.forEach(processor => {
        ruleApplicationStats.set(processor.ruleId, { 
          attempted: 0, 
          succeeded: 0,
          fieldName: processor.name
        });
      });
      
      // Process each row in the sub-batch
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 1;
        
        // Transform row to claim
        const claim = this.transformRowToClaim(row, mapping, rowNumber);
        
        // Apply enrichment rules if available
        if (this.enrichmentRules.length > 0) {
          try {
            const enrichmentResults = await this.applyEnrichmentRules(claim, ruleApplicationStats);
            
            // If any enrichment was successful, add it to the claim
            if (enrichmentResults.success) {
              claim.dynamicFields = enrichmentResults.fields;
              this.enrichedRows++;
            }
          } catch (enrichmentError) {
            console.error(`Enrichment error on row ${rowNumber}:`, enrichmentError);
            // Continue processing without enrichment
          }
        }
        
        // Insert claim with enrichment data (if available)
        await client.query(
          `INSERT INTO claim_records (
            record_id, file_id, row_number, 
            mapped_fields, unmapped_fields, dynamic_fields,
            validation_status, processing_status,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            claim.recordId,
            this.fileId,
            claim.rowNumber,
            JSON.stringify(claim.mappedFields),
            JSON.stringify(claim.unmappedFields),
            JSON.stringify(claim.dynamicFields || {}),
            claim.validationStatus,
            claim.processingStatus,
            this.userId
          ]
        );
      }
      
      // Commit transaction
      await client.query('COMMIT');
      
      // Log enrichment stats periodically
      if (this.processedRows % 1000 === 0) {
        const stats = Array.from(ruleApplicationStats.entries()).map(([ruleId, stats]) => ({
          ruleId,
          name: stats.fieldName,
          attempted: stats.attempted,
          succeeded: stats.succeeded,
          successRate: stats.attempted > 0 ? Math.round((stats.succeeded / stats.attempted) * 100) : 0
        }));
        
        console.log('Enrichment application stats:', stats);
      }
      
    } catch (error) {
      // Rollback on error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
      
      this.failedRows += rows.length;
      throw error;
    } finally {
      // Always release the client
      client.release();
    }
  }

  /**
   * Apply enrichment rules to a claim
   */
  private async applyEnrichmentRules(
    claim: any,
    stats?: Map<string, { attempted: number, succeeded: number, fieldName: string }>
  ): Promise<{ success: boolean, fields: Record<string, any> }> {
    const fields: Record<string, any> = {};
    let anyRuleSucceeded = false;
    
    for (const processor of this.enrichmentRules) {
      try {
        // Get rule parameters
        const rule = enrichmentRuleRegistry.getRuleById(processor.ruleId);
        const parameters = rule?.parameters || {};
        
        // Check if the rule can be applied to this claim
        if (processor.validate(claim, parameters)) {
          // Track attempt
          if (stats) {
            const ruleStats = stats.get(processor.ruleId);
            if (ruleStats) {
              ruleStats.attempted++;
            }
          }
          
          // Apply the rule
          const result = await processor.process(claim, parameters);
          
          if (result.success && result.fieldValue) {
            // Add the enriched data
            fields[result.fieldName] = result.fieldValue;
            anyRuleSucceeded = true;
            
            // Track success
            if (stats) {
              const ruleStats = stats.get(processor.ruleId);
              if (ruleStats) {
                ruleStats.succeeded++;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error applying rule ${processor.name}:`, error);
        // Continue with other rules
      }
    }
    
    return {
      success: anyRuleSucceeded,
      fields
    };
  }

  /**
   * Transform a row into a claim record
   */
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
      dynamicFields: {},
      validationStatus: 'PENDING_VALIDATION',
      processingStatus: 'PROCESSED'
    };
  }

  /**
   * Get file mapping configuration
   */
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

  /**
   * Update processing status
   */
  private async updateProcessingStatus(status: ProcessingStatus): Promise<void> {
    await query(`
      UPDATE claim_processing_history
      SET 
        status = $1,
        ${status === ProcessingStatus.COMPLETED ? 'end_time = CURRENT_TIMESTAMP,' : ''}
        updated_at = CURRENT_TIMESTAMP,
        processing_mode = 'combined'
      WHERE processing_id = $2
    `, [status, this.processingId]);
  }

  /**
   * Update processing progress
   */
  private async updateProgress(): Promise<void> {
    // Calculate performance metrics
    const currentTime = Date.now();
    const elapsedTimeMs = currentTime - this.startTime;
    const rowsPerSecond = this.processedRows / (elapsedTimeMs / 1000 || 1);
    const estimatedTimeRemaining = (this.totalRows - this.processedRows) / (rowsPerSecond || 1);
    
    await query(`
      UPDATE claim_processing_history
      SET 
        processed_rows = $1,
        total_rows = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE processing_id = $3
    `, [this.processedRows, this.totalRows, this.processingId]);
    
    // Log performance metrics
    console.log(
      `Processing progress: ${this.processedRows}/${this.totalRows} rows ` +
      `(${Math.round(rowsPerSecond)} rows/sec, ETA: ${Math.round(estimatedTimeRemaining)}s, ` +
      `Enriched: ${this.enrichedRows}, Failed: ${this.failedRows})`
    );
  }

  /**
   * Update file status
   */
  private async updateFileStatus(status: FileStatus): Promise<void> {
    await query(`
      UPDATE claims_file_registry
      SET 
        status = $1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = $2
      WHERE file_id = $3
    `, [status, this.userId, this.fileId]);
  }

  /**
   * Handle processing error
   */
  private async handleProcessingError(error: unknown): Promise<void> {
    const errorDetails = {
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString(),
      details: error instanceof Error ? error.stack : String(error)
    };
  
    // Update processing history with error
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
          updated_by = $2
        WHERE file_id = $3
      `, [FileStatus.ERROR, this.userId, this.fileId]);
    } catch (dbError) {
      console.error('Failed to update error status:', dbError);
    } finally {
      client.release();
    }
  }
}

// Factory function for creating service instances
export function createCombinedClaimsProcessor(
  fileId: string,
  processingId: string,
  s3Location: string,
  userId: string = 'system'
): CombinedClaimsProcessor {
  return new CombinedClaimsProcessor(fileId, processingId, s3Location, userId);
}