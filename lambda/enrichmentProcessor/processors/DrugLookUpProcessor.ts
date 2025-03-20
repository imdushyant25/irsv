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
   * Enriches claims with drug information and plan exclusion indicators
   * Stores results in the lookup_fields column of claim_records
   * 
   * The enriched data will have this structure:
   * {
   *   "drug_info": {
   *     "brand_generic": "G|B",
   *     "specialty_indicator": boolean,
   *     "preventive_drug": boolean
   *   },
   *   "planExclusions": {
   *     "otc_drug_indicator": boolean,
   *     "questionable_clinical_effectiveness": boolean,
   *     "medical_benefit_only": boolean,
   *     "lcv_wow": boolean,
   *     "abortifacient": boolean,
   *     "weight_loss_inj": boolean,
   *     "weight_loss_oral": boolean,
   *     "fertility": boolean,
   *     "growth_hormone": boolean,
   *     "desi": boolean
   *   }
   * }
   */
  /**
   * For backward compatibility, we're maintaining the existing drugLookupEnrichment
   * in dynamic_fields while adding the new data to lookup_fields
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
                      cr.mapped_fields->>'ndc11' as ndc11,
                      cr.lookup_fields
                  FROM claim_records cr
                  WHERE cr.file_id = $1 
                  AND cr.row_number BETWEEN $2 AND $3
                  AND cr.mapped_fields->>'ndc11' IS NOT NULL
                  AND cr.mapped_fields->>'ndc11' != ''
              ),
              enrichment_data AS (
                  SELECT 
                      ec.record_id,
                      -- Data for lookup_fields column
                      jsonb_build_object(
                          'drug_info', jsonb_build_object(
                              'brand_generic', dm.brand_generic,
                              'specialty_indicator', dm.specialty_indicator,
                              'preventive_drug', (dm.is_aca = true OR dm.is_hdhp = true)
                          ),
                          'planExclusions', jsonb_build_object(
                              'otc_drug_indicator', COALESCE(dm.otc_drug_indicator, 'N'),
                              'questionable_clinical_effectiveness', COALESCE(dm.questionable_clinical_effectiveness, 'N'),
                              'medical_benefit_only', COALESCE(dm.medical_benefit_only, 'N'),
                              'lcv_wow', COALESCE(dm.lcv_wow, 'N'),
                              'abortifacient', COALESCE(dm.abortifacient, 'N'),
                              'weight_loss_inj', COALESCE(dm.weight_loss_inj, 'N'),
                              'weight_loss_oral', COALESCE(dm.weight_loss_oral, 'N'),
                              'fertility', COALESCE(dm.fertility, 'N'),
                              'growth_hormone', COALESCE(dm.growth_hormone, 'N'),
                              'desi', COALESCE(dm.desi, 'N')
                          )
                      ) AS lookup_data,
                      -- Data for dynamic_fields column (backward compatibility)
                      jsonb_build_object(
                          'brand_generic', dm.brand_generic,
                          'specialty_indicator', dm.specialty_indicator,
                          'preventive_drug', (dm.is_aca = true OR dm.is_hdhp = true)
                      ) AS drug_data,
                      ec.lookup_fields
                  FROM enrichable_claims ec
                  JOIN drug_master dm ON dm.ndc11 = ec.ndc11
              )
              UPDATE claim_records cr
              SET 
                  -- Update lookup_fields with new format
                  lookup_fields = COALESCE(cr.lookup_fields, '{}'::jsonb) || ed.lookup_data,
                  -- Maintain existing dynamic_fields for backward compatibility
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