// File: src/services/enrichment/EnrichmentService.ts

import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/db';
import { 
  ClaimRecord, 
  EnrichmentRun, 
  EnrichmentStatus, 
  EnrichmentResult,
  EnrichmentRuleProcessor
} from '@/types/enrichment';
import { enrichmentRuleRegistry } from './EnrichmentRuleRegistry';
import { DatabaseError } from '@/lib/errors/database';
import { FileStatus, ProcessingStage } from '@/types/file';

// Reduce batch size from 1000 to 100
const BATCH_SIZE = 100; // Process 100 claims at a time

export class EnrichmentService {
  /**
   * Start the enrichment process for a file
   */
  public async startEnrichment(
    fileId: string, 
    userId: string
  ): Promise<{ runId: string }> {
    try {
      // Ensure the rule registry is initialized
      if (!enrichmentRuleRegistry.isInitialized()) {
        await enrichmentRuleRegistry.loadRules();
      }
      
      // Verify there are processors registered
      const processors = enrichmentRuleRegistry.getProcessors();
      if (processors.length === 0) {
        console.warn('No active enrichment rule processors found - registering defaults');
        
        // Import and register processors if not already registered
        const { registerRuleProcessors } = await import('./rules');
        registerRuleProcessors();
      }
  
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

      // Start the enrichment process asynchronously
      this.processFileEnrichment(runId, fileId, userId).catch(error => {
        console.error('Error during enrichment processing:', error);
      });

      return { runId };
    } catch (error) {
      throw DatabaseError.fromError(error);
    }
  }

  /**
   * Process all claims in a file for enrichment
   */
  private async processFileEnrichment(
    runId: string, 
    fileId: string, 
    userId: string  
  ): Promise<void> {
    try {
      // Update run status to RUNNING
      await this.updateStatus(runId, EnrichmentStatus.RUNNING);

      // Ensure processors are registered
      const { registerRuleProcessors } = await import('./rules');
      registerRuleProcessors();

      // Get all active processors
      const processors = enrichmentRuleRegistry.getProcessors();
      if (processors.length === 0) {
        throw new Error('No active enrichment rule processors available');
      }

      console.log(`Processing file with ${processors.length} active rule processors`);

      // Get total number of claims
      const countResult = await query(`
        SELECT COUNT(*) as count
        FROM claim_records
        WHERE file_id = $1
      `, [fileId]);
      
      const totalRecords = parseInt(countResult.rows[0].count);
      let processedRecords = 0;
      let enrichedRecords = 0;
      let failedRecords = 0;
      
      // Track which rules were applied successfully to any claims
      const ruleApplicationStats = new Map<string, { 
        attempted: number, 
        succeeded: number,
        fieldName: string
      }>();
      
      // Initialize stats for each processor
      processors.forEach(processor => {
        ruleApplicationStats.set(processor.ruleId, { 
          attempted: 0, 
          succeeded: 0,
          fieldName: processor.name
        });
      });

      // Process claims in batches
      for (let offset = 0; offset < totalRecords; offset += BATCH_SIZE) {
        // Fetch a batch of claims
        const claimsResult = await query<ClaimRecord>(`
          SELECT 
            record_id as "recordId",
            mapped_fields as "mappedFields",
            unmapped_fields as "unmappedFields",
            dynamic_fields as "dynamicFields"
          FROM claim_records
          WHERE file_id = $1
          ORDER BY row_number ASC
          LIMIT $2 OFFSET $3
        `, [fileId, BATCH_SIZE, offset]);

        // Start transaction for batch processing
        await query('BEGIN');

        try {
          // Process each claim in the batch
          for (const claim of claimsResult.rows) {
            processedRecords++;
            const enrichmentResults = await this.applyRulesToClaim(claim, processors, ruleApplicationStats, runId);
            
            // Continue even if some enrichments failed
            let claimSuccess = enrichmentResults.some(result => result.success);
            if (claimSuccess) {
              enrichedRecords++;
            } else {
              failedRecords++;
            }

            // Aggregate enrichment results
            const dynamicFields = claim.dynamicFields || {};
            let hadFailures = false;

            for (const result of enrichmentResults) {
              if (result.success) {
                // Add the enriched data to dynamic fields
                dynamicFields[result.fieldName] = result.fieldValue;
              } else {
                hadFailures = true;
                // Log the failure but don't stop processing other rules
                await query(`
                  INSERT INTO enrichment_failures (
                    id, run_id, claim_record_id, rule_id, 
                    error_message, created_at
                  ) VALUES ($1, $2, $3, $4, $5, NOW())
                `, [
                  uuidv4(), 
                  runId, 
                  claim.recordId, 
                  result.ruleId || 'unknown', 
                  result.error || 'Unknown error'
                ]);
              }
            }

            // Update claim with enriched data, even if some rules failed
            if (Object.keys(dynamicFields).length > 0) {
              await query(`
                UPDATE claim_records
                SET 
                  dynamic_fields = $1,
                  updated_at = NOW(),
                  updated_by = $2
                WHERE record_id = $3
              `, [JSON.stringify(dynamicFields), userId, claim.recordId]);
            }
          }

          // Commit transaction
          await query('COMMIT');
        } catch (error) {
          // Rollback transaction on error
          await query('ROLLBACK');
          console.error("Error processing batch:", error);
          // Continue with next batch instead of stopping the whole process
        }

        // Update progress periodically
        await query(`
          UPDATE enrichment_runs
          SET 
            enriched_records = $1,
            failed_records = $2,
            updated_at = NOW(),
            updated_by = $3
          WHERE run_id = $4
        `, [enrichedRecords, failedRecords, userId, runId]);
      }

      // Generate stats for which rules were applied
      const ruleStats = Array.from(ruleApplicationStats.entries()).map(([ruleId, stats]) => ({
        ruleId,
        ruleName: stats.fieldName,
        attempted: stats.attempted,
        succeeded: stats.succeeded,
        successRate: stats.attempted > 0 ? (stats.succeeded / stats.attempted) * 100 : 0
      }));

      console.log("Enrichment rule application stats:", ruleStats);

      // Calculate whether we consider this a success or partial success
      // If any records were enriched at all, we consider it at least partially successful
      const finalStatus = enrichedRecords > 0 
        ? EnrichmentStatus.COMPLETED 
        : EnrichmentStatus.ERROR;

      await query(`
        UPDATE enrichment_runs
        SET 
          status = $1,
          completed_at = NOW(),
          enriched_records = $2,
          failed_records = $3,
          updated_at = NOW(),
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

      // Update file status to ENRICHED if any records were enriched
      if (enrichedRecords > 0) {
        await query(`
          UPDATE claims_file_registry
          SET 
            status = $1,
            processing_stage = $2,
            updated_at = NOW(),
            updated_by = $3
          WHERE file_id = $4
        `, [FileStatus.ENRICHED, ProcessingStage.PROCESSED, userId, fileId]);
      }

    } catch (error) {
      // Update run status to ERROR
      await this.updateStatus(runId, EnrichmentStatus.ERROR);
      console.error('Error in enrichment processing:', error);
      
      // Log details about the error for debugging
      const errorDetails = {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      };
      
      await query(`
        UPDATE enrichment_runs
        SET error_details = $1
        WHERE run_id = $2
      `, [JSON.stringify(errorDetails), runId]);
      
      throw error;
    }
  }

  /**
   * Apply all rules to a single claim - modified to track rule application stats
   */
  private async applyRulesToClaim(
    claim: ClaimRecord, 
    processors: EnrichmentRuleProcessor[],
    stats?: Map<string, { attempted: number, succeeded: number, fieldName: string }>,
    runId?: string // Make runId optional and place it last
  ): Promise<Array<EnrichmentResult & { ruleId?: string }>> {
    const results: Array<EnrichmentResult & { ruleId?: string }> = [];
  
    for (const processor of processors) {
      try {
        // Get rule parameters
        const rule = enrichmentRuleRegistry.getRuleById(processor.ruleId);
        const parameters = rule?.parameters || {};
  
        // First check: does this claim have the required fields for validation?
        try {
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
            
            // Add rule ID to the result
            const resultWithRuleId = {
              ...result,
              ruleId: processor.ruleId
            };
            
            results.push(resultWithRuleId);
            
            // Track success
            if (stats && result.success) {
              const ruleStats = stats.get(processor.ruleId);
              if (ruleStats) {
                ruleStats.succeeded++;
              }
            }
          } else if (runId) {
            // If validation fails and we have a runId, log it to the failures table
            await this.logEnrichmentFailure(
              runId,
              claim.recordId,
              processor.ruleId,
              `Validation failed: required fields for rule "${processor.name}" not available or not properly formatted`
            );
            
            // Add as a failed result
            results.push({
              success: false,
              fieldName: `${processor.name}_skipped`,
              fieldValue: null,
              error: `Validation failed: required fields for rule not available`,
              ruleId: processor.ruleId
            });
            
            // Track attempt but not success
            if (stats) {
              const ruleStats = stats.get(processor.ruleId);
              if (ruleStats) {
                ruleStats.attempted++;
              }
            }
          }
        } catch (error) {
          // Handle validation errors
          if (runId) {
            await this.logEnrichmentFailure(
              runId,
              claim.recordId,
              processor.ruleId,
              `Validation error: ${error instanceof Error ? error.message : 'Unknown validation error'}`
            );
          }
          
          results.push({
            success: false,
            fieldName: `${processor.name}_validation_error`,
            fieldValue: null,
            error: `Validation error: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
            ruleId: processor.ruleId
          });
        }
      } catch (error) {
        // General errors in the processor itself
        if (runId) {
          await this.logEnrichmentFailure(
            runId,
            claim.recordId,
            processor.ruleId,
            `Rule processing error: ${error instanceof Error ? error.message : 'Unknown error during rule processing'}`
          );
        }
        
        // Add error result for this processor but continue with others
        results.push({
          success: false,
          fieldName: `${processor.name}_error`,
          fieldValue: null,
          error: error instanceof Error ? error.message : 'Unknown error during rule processing',
          ruleId: processor.ruleId
        });
        
        // Track attempt but not success
        if (stats) {
          const ruleStats = stats.get(processor.ruleId);
          if (ruleStats) {
            ruleStats.attempted++;
          }
        }
      }
    }
  
    return results;
  }
  
  // Add this helper method to log failures
private async logEnrichmentFailure(
  runId: string,
  claimRecordId: string,
  ruleId: string,
  errorMessage: string,
  errorDetails?: any
): Promise<void> {
  try {
    // Generate a UUID for the failure record
    const failureId = uuidv4();
    
    // Insert into the enrichment_failures table
    await query(`
      INSERT INTO enrichment_failures (
        id, run_id, claim_record_id, rule_id, 
        error_message, error_details, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      failureId, 
      runId, 
      claimRecordId, 
      ruleId, 
      errorMessage,
      errorDetails ? JSON.stringify(errorDetails) : null
    ]);
  } catch (error) {
    // Don't let logging failures interrupt the main process
    console.error('Failed to log enrichment failure:', error);
  }
}

  /**
   * Update enrichment run status
   */
  private async updateStatus(runId: string, status: EnrichmentStatus): Promise<void> {
    await query(`
      UPDATE enrichment_runs
      SET 
        status = $1,
        updated_at = NOW()
      WHERE run_id = $2
    `, [status, runId]);
  }

  /**
   * Get the status of an enrichment run
   */
  public async getEnrichmentStatus(runId: string): Promise<EnrichmentRun> {
    try {
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
    } catch (error) {
      throw DatabaseError.fromError(error);
    }
  }
}

// Create a singleton instance
export const enrichmentService = new EnrichmentService();