// File: src/services/enrichment/LambdaEnrichmentService.ts

import { v4 as uuidv4 } from 'uuid';
import { invokeLambda } from '@/lib/aws/lambda';
import { query } from '@/lib/db';
import { 
  EnrichmentRun, 
  EnrichmentStatus 
} from '@/types/enrichment';
import { features } from '@/config/features';
import { FileStatus } from '@/types/file';

/**
 * Handles enrichment processing via AWS Lambda
 */
export class LambdaEnrichmentService {
  /**
   * Start the enrichment process for a file
   */
  public async startEnrichment(
    fileId: string, 
    userId: string
  ): Promise<{ runId: string }> {
    try {
      // Get the total number of claims for the file
      const countResult = await query(`
        SELECT COUNT(*) as count
        FROM claim_records
        WHERE file_id = $1
      `, [fileId]);

      const totalRecords = parseInt(countResult.rows[0].count);
      
      if (totalRecords === 0) {
        throw new Error('No claim records found for the specified file');
      }

      // Create a new enrichment run record
      const runId = uuidv4();
      await query(`
        INSERT INTO enrichment_runs (
          run_id, file_id, started_at, total_records, 
          enriched_records, failed_records, status, created_by
        ) VALUES ($1, $2, NOW(), $3, 0, 0, $4, $5)
      `, [runId, fileId, totalRecords, EnrichmentStatus.PENDING, userId]);

      // Determine the enrichment batch size
      const batchSize = features.batchSizes.enrichmentBatchSize;

      // Create batches based on row numbers
      const batches = [];
      for (let startRow = 1; startRow <= totalRecords; startRow += batchSize) {
        const endRow = Math.min(startRow + batchSize - 1, totalRecords);
        const batchId = uuidv4();
        
        // Create batch record
        await query(`
          INSERT INTO batch_processing_status (
            batch_id, file_id, start_row, end_row, total_rows,
            processing_status, enrichment_status, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          batchId, 
          fileId, 
          startRow, 
          endRow, 
          endRow - startRow + 1,
          'PROCESSED', // Assume claims processing is already done
          EnrichmentStatus.PENDING,
          userId
        ]);
        
        batches.push({
          batchId,
          fileId,
          startRow,
          endRow
        });
      }
      
      console.log(`Created ${batches.length} enrichment batches for file ${fileId}`);

      // Update run status to RUNNING
      await this.updateStatus(runId, EnrichmentStatus.RUNNING, userId);

      // Process batches asynchronously
      this.processBatches(runId, batches, userId).catch(error => {
        console.error('Error during batch processing:', error);
      });

      return { runId };
    } catch (error) {
      console.error('Error starting enrichment:', error);
      throw error;
    }
  }

  /**
   * Process all batches via Lambda invocations
   */
  private async processBatches(
    runId: string, 
    batches: Array<{batchId: string, fileId: string, startRow: number, endRow: number}>,
    userId: string
  ): Promise<void> {
    try {
      // Track batch completion
      let enrichedRecords = 0;
      let failedRecords = 0;
      let completedBatches = 0;
      
      const totalBatches = batches.length;
      const fileId = batches[0].fileId; // All batches have the same fileId
      
      // Process batches in parallel with a limit of 5 concurrent invocations
      const concurrencyLimit = 10;
      
      for (let i = 0; i < batches.length; i += concurrencyLimit) {
        const batchGroup = batches.slice(i, i + concurrencyLimit);
        
        // Invoke Lambda functions for this batch group in parallel
        await Promise.all(batchGroup.map(async (batch) => {
          try {
            // Define Lambda payload
            const payload = {
              batchId: batch.batchId,
              fileId: batch.fileId,
              startRow: batch.startRow,
              endRow: batch.endRow,
              runId: runId
            };
            
            // Get Lambda function name from environment variable
            const functionName = process.env.ENRICHMENT_LAMBDA_NAME || 'enrichment-processor';
            
            // Invoke Lambda function
            console.log(`Invoking Lambda for batch ${batch.batchId} (${batch.startRow}-${batch.endRow})`);
            await invokeLambda(functionName, payload, 'Event'); // Asynchronous invocation
            
          } catch (error) {
            console.error(`Error invoking Lambda for batch ${batch.batchId}:`, error);
            
            // Update batch status to ERROR
            await query(`
              UPDATE batch_processing_status
              SET 
                enrichment_status = $1,
                error_details = $2,
                updated_at = CURRENT_TIMESTAMP
              WHERE batch_id = $3
            `, [
              EnrichmentStatus.ERROR,
              JSON.stringify({
                message: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
              }),
              batch.batchId
            ]);
            
            failedRecords += (batch.endRow - batch.startRow + 1);
          }
        }));
        
        // After each batch group, wait a bit to avoid overloading the database
        if (i + concurrencyLimit < batches.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Update progress after each batch group
        await this.updateRunProgress(runId, fileId, userId);
      }
      
      // Now poll for completion of all batches
      let allBatchesCompleted = false;
      const maxWaitTimeMs = 15 * 60 * 1000; // 15 minutes
      const startTime = Date.now();
      
      while (!allBatchesCompleted && (Date.now() - startTime) < maxWaitTimeMs) {
        // Check batch statuses
        const batchStatuses = await query(`
          SELECT 
            enrichment_status, 
            COUNT(*) as count,
            SUM(end_row - start_row + 1) as records
          FROM batch_processing_status
          WHERE file_id = $1
          GROUP BY enrichment_status
        `, [fileId]);
        
        // Calculate completion statistics
        const statusMap: Record<string, { count: number, records: number }> = {};
        let totalCompleted = 0;
        
        batchStatuses.rows.forEach(row => {
          statusMap[row.enrichment_status] = {
            count: parseInt(row.count),
            records: parseInt(row.records)
          };
          
          if (row.enrichment_status === EnrichmentStatus.COMPLETED) {
            totalCompleted += parseInt(row.count);
          }
        });
        
        console.log(`Batch status: ${JSON.stringify(statusMap)}`);
        
        // Update run progress
        await this.updateRunProgress(runId, fileId, userId);
        
        // Check if all batches are completed or in error state
        const completedBatches = statusMap[EnrichmentStatus.COMPLETED]?.count || 0;
        const errorBatches = statusMap[EnrichmentStatus.ERROR]?.count || 0;
        
        if (completedBatches + errorBatches === totalBatches) {
          allBatchesCompleted = true;
          break;
        }
        
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // Final update based on all batch statuses
      const finalStatus = await this.updateFinalStatus(runId, fileId, userId);
      
      // Update file status to ENRICHED if any records were successfully enriched
      if (finalStatus === EnrichmentStatus.COMPLETED) {
        await query(`
          UPDATE claims_file_registry
          SET 
            status = $1,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = $2
          WHERE file_id = $3
        `, [FileStatus.ENRICHED, userId, fileId]);
      }
      
    } catch (error) {
      console.error('Error processing batches:', error);
      
      // Update run status to ERROR
      await this.updateStatus(runId, EnrichmentStatus.ERROR, userId);
      
      throw error;
    }
  }

  /**
   * Update enrichment run progress based on batch statuses
   */
  private async updateRunProgress(runId: string, fileId: string, userId: string): Promise<void> {
    try {
      // Get batch statistics
      const batchStats = await query(`
        SELECT 
          enrichment_status, 
          SUM(end_row - start_row + 1) as records
        FROM batch_processing_status
        WHERE file_id = $1
        GROUP BY enrichment_status
      `, [fileId]);
      
      // Calculate records by status
      let enrichedRecords = 0;
      let failedRecords = 0;
      
      batchStats.rows.forEach(row => {
        if (row.enrichment_status === EnrichmentStatus.COMPLETED) {
          enrichedRecords += parseInt(row.records);
        } else if (row.enrichment_status === EnrichmentStatus.ERROR) {
          failedRecords += parseInt(row.records);
        }
      });
      
      // Update run record
      await query(`
        UPDATE enrichment_runs
        SET 
          enriched_records = $1,
          failed_records = $2,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = $3
        WHERE run_id = $4
      `, [enrichedRecords, failedRecords, userId, runId]);
    } catch (error) {
      console.error('Error updating run progress:', error);
    }
  }

  /**
   * Update the final status of the enrichment run
   */
  private async updateFinalStatus(runId: string, fileId: string, userId: string): Promise<EnrichmentStatus> {
    // Get batch statistics
    const batchStats = await query(`
      SELECT 
        enrichment_status, 
        COUNT(*) as count,
        SUM(end_row - start_row + 1) as records
      FROM batch_processing_status
      WHERE file_id = $1
      GROUP BY enrichment_status
    `, [fileId]);
    
    // Calculate final status
    let totalBatches = 0;
    let completedBatches = 0;
    let pendingBatches = 0;
    let errorBatches = 0;
    
    let enrichedRecords = 0;
    let failedRecords = 0;
    
    batchStats.rows.forEach(row => {
      const count = parseInt(row.count);
      const records = parseInt(row.records);
      
      totalBatches += count;
      
      if (row.enrichment_status === EnrichmentStatus.COMPLETED) {
        completedBatches += count;
        enrichedRecords += records;
      } else if (row.enrichment_status === EnrichmentStatus.ERROR) {
        errorBatches += count;
        failedRecords += records;
      } else if (
        row.enrichment_status === EnrichmentStatus.PENDING || 
        row.enrichment_status === EnrichmentStatus.RUNNING
      ) {
        pendingBatches += count;
      }
    });
    
    // Determine final status
    let finalStatus: EnrichmentStatus;
    
    if (pendingBatches > 0) {
      // If any batches are still pending, stay in RUNNING state
      finalStatus = EnrichmentStatus.RUNNING;
    } else if (completedBatches > 0) {
      // If some batches completed successfully, mark as COMPLETED
      // even if some had errors (partial success)
      finalStatus = EnrichmentStatus.COMPLETED;
    } else {
      // All batches failed
      finalStatus = EnrichmentStatus.ERROR;
    }
    
    // Generate stats for rule application
    const ruleStats = await this.getRuleApplicationStats(fileId);
    
    // Update final status with completion time if done
    if (finalStatus === EnrichmentStatus.COMPLETED || finalStatus === EnrichmentStatus.ERROR) {
      await query(`
        UPDATE enrichment_runs
        SET 
          status = $1,
          completed_at = CURRENT_TIMESTAMP,
          enriched_records = $2,
          failed_records = $3,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = $4,
          error_details = $5
        WHERE run_id = $6
      `, [
        finalStatus,
        enrichedRecords,
        failedRecords,
        userId,
        JSON.stringify({ ruleStats }),
        runId
      ]);
    } else {
      // Just update progress without completing
      await query(`
        UPDATE enrichment_runs
        SET 
          enriched_records = $1,
          failed_records = $2,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = $3
        WHERE run_id = $4
      `, [
        enrichedRecords,
        failedRecords,
        userId,
        runId
      ]);
    }
    
    return finalStatus;
  }

  /**
   * Get statistics about which rules were applied to claims
   */
  private async getRuleApplicationStats(fileId: string): Promise<any[]> {
    try {
      // For each enrichment field type, count how many records have it
      const fieldStats = await query(`
        SELECT 
          jsonb_object_keys(dynamic_fields) as field_name,
          COUNT(*) as count
        FROM claim_records
        WHERE file_id = $1
        AND dynamic_fields IS NOT NULL
        AND dynamic_fields != '{}'::jsonb
        GROUP BY jsonb_object_keys(dynamic_fields)
      `, [fileId]);
      
      return fieldStats.rows.map(row => ({
        fieldName: row.field_name,
        count: parseInt(row.count)
      }));
    } catch (error) {
      console.error('Error getting rule application stats:', error);
      return [];
    }
  }

  /**
   * Update enrichment run status
   */
  private async updateStatus(runId: string, status: EnrichmentStatus, userId: string): Promise<void> {
    await query(`
      UPDATE enrichment_runs
      SET 
        status = $1,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = $2
      WHERE run_id = $3
    `, [status, userId, runId]);
  }

  /**
   * Get the status of an enrichment run
   */
  public async getEnrichmentStatus(runId: string): Promise<EnrichmentRun> {
    const result = await query<EnrichmentRun>(`
      SELECT 
        run_id as "runId",
        file_id as "fileId",
        started_at as "startedAt",
        completed_at as "completedAt",
        total_records as "totalRecords",
        enriched_records as "enrichedRecords",
        failed_records as "failedRecords",
        status,
        error_details as "errorDetails",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_by as "updatedBy",
        updated_at as "updatedAt"
      FROM enrichment_runs
      WHERE run_id = $1
    `, [runId]);

    if (result.rows.length === 0) {
      throw new Error(`Enrichment run with ID ${runId} not found`);
    }

    return result.rows[0];
  }
}

export const lambdaEnrichmentService = new LambdaEnrichmentService();