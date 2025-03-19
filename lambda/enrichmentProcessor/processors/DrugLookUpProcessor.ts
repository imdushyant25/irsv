// File: lambda/enrichmentProcessor/processors/DrugLookUpProcessor.ts

import { Pool, Client } from 'pg';
import { v4 as uuidv4 } from 'uuid';

/**
 * Rule processor for drug information lookup and enrichment
 * Optimized to process batches of claims at the database tier
 */
export class DrugLookUpProcessor {
  name: string = 'Drug Lookup Processor';
  ruleId: string = '3f91e6c0-4b5a-4c9f-8e7d-5a8c6a7b5d4g';
  
  /**
   * Process a batch of claims at the database tier
   */
  async processBatch(client: Client, fileId: string, startRow: number, endRow: number): Promise<{
      totalProcessed: number;
      enriched: number;
      failed: number;
      details?: any;
  }> {
      try {
          // Count total records in the batch to enrich
          const countQuery = `
              SELECT COUNT(*) as total
              FROM claim_records
              WHERE file_id = $1 AND row_number BETWEEN $2 AND $3
          `;
          const countResult = await client.query(countQuery, [fileId, startRow, endRow]);
          const totalRecords = parseInt(countResult.rows[0].total || '0');
          
          // Perform the enrichment with a direct SQL update that joins tables
          const enrichmentQuery = `
              WITH enrichable_claims AS (
                  SELECT 
                      cr.record_id,
                      cr.mapped_fields->>'ndc11' as ndc11
                  FROM claim_records cr
                  WHERE cr.file_id = $1 
                  AND cr.row_number BETWEEN $2 AND $3
                  AND cr.mapped_fields->>'ndc11' IS NOT NULL
                  AND cr.mapped_fields->>'ndc11' != ''
              ),
              enrichment_data AS (
                  SELECT 
                      ec.record_id,
                      jsonb_build_object(
                          'brand_generic', dm.brand_generic,
                          'specialty_indicator', dm.specialty_indicator,
                          'preventive_drug', (dm.is_aca = true OR dm.is_hdhp = true)
                      ) AS drug_data
                  FROM enrichable_claims ec
                  JOIN drug_master dm ON dm.ndc11 = ec.ndc11
              )
              UPDATE claim_records cr
              SET 
                  dynamic_fields = CASE 
                      WHEN cr.dynamic_fields IS NULL OR cr.dynamic_fields = '{}'::jsonb 
                      THEN jsonb_build_object('drugLookupEnrichment', ed.drug_data)
                      ELSE jsonb_set(cr.dynamic_fields, '{drugLookupEnrichment}', ed.drug_data)
                  END,
                  updated_at = CURRENT_TIMESTAMP,
                  updated_by = 'lambda-enrichment'
              FROM enrichment_data ed
              WHERE cr.record_id = ed.record_id
              RETURNING cr.record_id
          `;
          
          const enrichmentResult = await client.query(enrichmentQuery, [fileId, startRow, endRow]);
          // Ensure the rowCount is a number (not null)
          const enrichedCount = enrichmentResult.rowCount || 0;
          
          // Count claims with NDCs that failed to enrich (not found in drug_master)
          const failedQuery = `
              SELECT COUNT(*) as failed
              FROM claim_records cr
              WHERE cr.file_id = $1 
              AND cr.row_number BETWEEN $2 AND $3
              AND cr.mapped_fields->>'ndc11' IS NOT NULL
              AND cr.mapped_fields->>'ndc11' != ''
              AND NOT EXISTS (
                  SELECT 1 FROM drug_master dm 
                  WHERE dm.ndc11 = cr.mapped_fields->>'ndc11'
              )
          `;
          
          const failedResult = await client.query(failedQuery, [fileId, startRow, endRow]);
          const failedCount = parseInt(failedResult.rows[0].failed || '0');
          
          return {
              totalProcessed: totalRecords,
              enriched: enrichedCount,
              failed: failedCount,
              details: {
                  attemptedNdcLookups: enrichedCount + failedCount
              }
          };
      } catch (error) {
          console.error('Error in batch drug lookup:', error);
          return {
              totalProcessed: 0,
              enriched: 0,
              failed: 0,
              details: {
                  error: error instanceof Error ? error.message : 'Unknown error during drug lookup',
                  stack: error instanceof Error ? error.stack : undefined
              }
          };
      }
  }   
}