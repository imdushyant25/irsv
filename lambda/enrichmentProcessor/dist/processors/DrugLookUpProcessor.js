"use strict";
// File: lambda/enrichmentProcessor/processors/DrugLookUpProcessor.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrugLookUpProcessor = void 0;
/**
 * Rule processor for drug information lookup and enrichment
 * Optimized to process batches of claims at the database tier
 */
class DrugLookUpProcessor {
    constructor() {
        this.name = 'Drug Lookup Processor';
        this.ruleId = '3f91e6c0-4b5a-4c9f-8e7d-5a8c6a7b5d4g';
    }
    /**
     * Process a batch of claims at the database tier
     * Enriches claims with drug information and plan exclusion indicators
     * Stores results in the lookup_fields column of claim_records
     *
     * Updated to use drugs_master table with a flat structure in lookup_fields
     */
    async processBatch(client, fileId, startRow, endRow) {
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
            // Using flat structure for lookup_fields
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
                      -- Flat structure for lookup_fields
                      jsonb_build_object(
                          'gpi14', dm.gpi14,
                          'brnd_gnrc', dm.brnd_gnrc,
                          'specialty_indicator', dm.specialty_indicator,
                          'otc_drug_ind', dm.otc_drug_ind,
                          'tier', dm.tier,
                          'questionable_clinical_effectiveness', dm.questionable_clinical_effectiveness,
                          'medical_benefit_only', dm.medical_benefit_only,
                          'lcv_wow', dm.lcv_wow,
                          'abortifacient', dm.abortifacient,
                          'weight_loss_inj', dm.weight_loss_inj,
                          'weight_loss_oral', dm.weight_loss_oral,
                          'fertility', dm.fertility,
                          'growth_hormone', dm.growth_hormone,
                          'desi', dm.desi,
                          'is_closed_formulary', dm.is_closed_formulary,
                          'is_open_formulary', dm.is_open_formulary,
                          'is_formulary_exclusion_closed', dm.is_formulary_exclusion_closed,
                          'is_mcap', dm.is_mcap,
                          'is_pa', dm.is_pa,
                          'is_pap', dm.is_pap,
                          'is_plan_exclusion', dm.is_plan_exclusion,
                          'is_rebate_elig', dm.is_rebate_elig,
                          'is_hdhp', dm.is_hdhp,
                          'is_ids', dm.is_ids,
                          'is_hans', dm.is_hans,
                          'is_aca', dm.is_aca,
                          'is_discount_card_elig', dm.is_discount_card_elig,
                          'gpi12', dm.gpi12,
                          'gpi10', dm.gpi10,
                          'gpi8', dm.gpi8,
                          'gpi6', dm.gpi6,
                          'gpi4', dm.gpi4,
                          'gpi2', dm.gpi2,
                          'gpi2_specialty_indicator', dm.gpi2_specialty_indicator,
                          'gpi2_brnd_gnrc', dm.gpi2_brnd_gnrc,
                          'gpi2_awp_per_ds', dm.gpi2_awp_per_ds,
                          'gpi2_rebate_yield', dm.gpi2_rebate_yield,
                          'gpi4_specialty_indicator', dm.gpi4_specialty_indicator,
                          'gpi4_brnd_gnrc', dm.gpi4_brnd_gnrc,
                          'gpi4_awp_per_ds', dm.gpi4_awp_per_ds,
                          'gpi4_rebate_yield', dm.gpi4_rebate_yield,
                          'gpi6_specialty_indicator', dm.gpi6_specialty_indicator,
                          'gpi6_brnd_gnrc', dm.gpi6_brnd_gnrc,
                          'gpi6_awp_per_ds', dm.gpi6_awp_per_ds,
                          'gpi6_rebate_yield', dm.gpi6_rebate_yield,
                          'preventive_drug', (dm.is_aca = 'Y' OR dm.is_hdhp = 'Y')
                      ) AS lookup_data,
                      ec.lookup_fields
                  FROM enrichable_claims ec
                  JOIN drugs_master dm ON dm.ndc11 = ec.ndc11
              )
              UPDATE claim_records cr
              SET 
                  -- Update lookup_fields with new flat format only, no longer updating dynamic_fields
                  lookup_fields = COALESCE(cr.lookup_fields, '{}'::jsonb) || ed.lookup_data,
                  updated_at = CURRENT_TIMESTAMP,
                  updated_by = 'lambda-enrichment'
              FROM enrichment_data ed
              WHERE cr.record_id = ed.record_id
              RETURNING cr.record_id
          `;
            const enrichmentResult = await client.query(enrichmentQuery, [fileId, startRow, endRow]);
            // Ensure the rowCount is a number (not null)
            const enrichedCount = enrichmentResult.rowCount || 0;
            // Count claims with NDCs that failed to enrich (not found in drugs_master)
            const failedQuery = `
              SELECT COUNT(*) as failed
              FROM claim_records cr
              WHERE cr.file_id = $1 
              AND cr.row_number BETWEEN $2 AND $3
              AND cr.mapped_fields->>'ndc11' IS NOT NULL
              AND cr.mapped_fields->>'ndc11' != ''
              AND NOT EXISTS (
                  SELECT 1 FROM drugs_master dm 
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
        }
        catch (error) {
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
exports.DrugLookUpProcessor = DrugLookUpProcessor;
//# sourceMappingURL=DrugLookUpProcessor.js.map