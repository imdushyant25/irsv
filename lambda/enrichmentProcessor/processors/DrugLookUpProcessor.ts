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
   * Enriches claims with drug information from MSPAN tables and calculated pricing fields
   * Stores results in the lookup_fields column of claim_records
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
          // Updated with classification logic and all calculations
          const enrichmentQuery = `
              WITH enrichable_claims AS (
                  SELECT 
                      cr.record_id,
                      cr.mapped_fields->>'ndc11' as ndc11,
                      cr.mapped_fields->>'fill_date' as fill_date,
                      cr.mapped_fields->>'quantity' as quantity,
                      cr.mapped_fields->>'member_cost' as member_cost,
                      cr.mapped_fields->>'days_supply' as days_supply,
                      cr.lookup_fields,
                      o.opportunity_metadata->'generalInformation' as general_info,
                      o.opportunity_metadata->'generalInformation'->>'formulary' as formulary,
                      o.opportunity_metadata->'generalInformation'->'copayModeling'->>'modelingType' as modeling_type
                  FROM claim_records cr
                  JOIN claims_file_registry cfr ON cr.file_id = cfr.file_id
                  JOIN opportunity o ON cfr.opportunity_id = o.opportunity_id
                  WHERE cr.file_id = $1 
                  AND cr.row_number BETWEEN $2 AND $3
                  AND cr.mapped_fields->>'ndc11' IS NOT NULL
              ),
              enrichment_data AS (
                  SELECT 
                      ec.record_id,
                      ec.ndc11,
                      ec.formulary,
                      ec.modeling_type,
                      ec.general_info,
                      dm.drug_label_name,
                      dm.drug_name,
                      awp.unit_price as mspan_unit_price,
                      CASE 
                          WHEN awp.unit_price IS NOT NULL AND ec.quantity IS NOT NULL 
                          THEN awp.unit_price * NULLIF(ec.quantity::numeric, 0) 
                          ELSE NULL 
                      END as mspan_awp,
                      ndc.mspan_maint_drug_code,
                      ndc.mspan_multi_source_code,
                      dm.specialty_indicator,
                      dm.brnd_gnrc,
                      dm.tier,
                      dm.is_closed_formulary,
                      dm.is_open_formulary,
                      ec.days_supply::numeric as days_supply,
                      dm.awp_discount::numeric as awp_discount,
                      ec.member_cost::numeric as member_cost,
                      
                      -- Check if drug is in the selected formulary
                      CASE
                          WHEN ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y' THEN true
                          WHEN ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y' THEN true
                          ELSE false
                      END as is_in_formulary,
                      
                      -- Classification based on rules including formulary check
                      CASE
                          WHEN ((ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y') OR 
                               (ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y'))
                              AND dm.specialty_indicator <> 'Y' AND dm.brnd_gnrc LIKE 'G%' 
                              AND ec.days_supply::numeric > 30 AND dm.tier = '1' 
                              THEN 'nsMailGeneric90'
                              
                          WHEN ((ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y') OR 
                               (ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y'))
                              AND dm.specialty_indicator = 'Y' AND dm.brnd_gnrc LIKE 'G%' 
                              AND dm.tier = '4' 
                              THEN 'specialtyGeneric'
                              
                          WHEN ((ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y') OR 
                               (ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y'))
                              AND dm.specialty_indicator <> 'Y' AND dm.brnd_gnrc LIKE 'G%' 
                              AND ec.days_supply::numeric <= 30 AND dm.tier = '1' 
                              THEN 'nsRetailGeneric30'
                              
                          WHEN ((ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y') OR 
                               (ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y'))
                              AND dm.specialty_indicator <> 'Y' AND dm.brnd_gnrc LIKE 'G%' 
                              AND ec.days_supply::numeric > 30 AND dm.tier = '1' 
                              THEN 'nsRetailGeneric90'
                              
                          WHEN ((ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y') OR 
                               (ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y'))
                              AND dm.specialty_indicator <> 'Y' AND dm.brnd_gnrc LIKE 'B%' 
                              AND ec.days_supply::numeric > 30 AND dm.tier = '2' 
                              THEN 'nsMailPreferredBrand90'
                              
                          WHEN ((ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y') OR 
                               (ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y'))
                              AND dm.specialty_indicator = 'Y' AND dm.brnd_gnrc LIKE 'B%' 
                              AND dm.tier = '5' 
                              THEN 'specialtyPreferredBrand'
                              
                          WHEN ((ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y') OR 
                               (ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y'))
                              AND dm.specialty_indicator <> 'Y' AND dm.brnd_gnrc LIKE 'B%' 
                              AND ec.days_supply::numeric <= 30 AND dm.tier = '2' 
                              THEN 'nsRetailPreferredBrand30'
                              
                          WHEN ((ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y') OR 
                               (ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y'))
                              AND dm.specialty_indicator <> 'Y' AND dm.brnd_gnrc LIKE 'B%' 
                              AND ec.days_supply::numeric > 30 AND dm.tier = '2' 
                              THEN 'nsRetailPreferredBrand90'
                              
                          WHEN ((ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y') OR 
                               (ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y'))
                              AND dm.specialty_indicator <> 'Y' AND dm.brnd_gnrc LIKE 'B%' 
                              AND ec.days_supply::numeric > 30 AND dm.tier = '3' 
                              THEN 'nsMailNonPreferredBrand90'
                              
                          WHEN ((ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y') OR 
                               (ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y'))
                              AND dm.specialty_indicator = 'Y' AND dm.brnd_gnrc LIKE 'B%' 
                              AND dm.tier = '6' 
                              THEN 'specialtyNonPreferredBrand'
                              
                          WHEN ((ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y') OR 
                               (ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y'))
                              AND dm.specialty_indicator <> 'Y' AND dm.brnd_gnrc LIKE 'B%' 
                              AND ec.days_supply::numeric <= 30 AND dm.tier = '3' 
                              THEN 'nsRetailNonPreferredBrand30'
                              
                          WHEN ((ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y') OR 
                               (ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y'))
                              AND dm.specialty_indicator <> 'Y' AND dm.brnd_gnrc LIKE 'B%' 
                              AND ec.days_supply::numeric > 30 AND dm.tier = '3' 
                              THEN 'nsRetailNonPreferredBrand90'
                              
                          ELSE NULL
                      END as drug_classification,
                      
                      -- Calculate Gross Cost (Step 4)
                      CASE 
                          WHEN awp.unit_price IS NOT NULL AND ec.quantity IS NOT NULL THEN
                              (1 - COALESCE(dm.awp_discount::numeric, 0)) * (awp.unit_price * NULLIF(ec.quantity::numeric, 0))
                          ELSE NULL
                      END as reprice_gross_cost,
                      
                      -- Get average rebate per day supply
                      CASE 
                          WHEN dm.brnd_gnrc LIKE 'B%' THEN
                              -- Extract appropriate rebate based on category from drugs_master
                              COALESCE(dm.avg_rebate_per_DS, 0)
                          ELSE 0 -- No rebates for generics
                      END as avg_rebate_per_DS
                      
                  FROM enrichable_claims ec
                  LEFT JOIN drugs_master dm ON dm.ndc11 = ec.ndc11
                  LEFT JOIN edpm.mspan_awp_info awp ON 
                      awp.ndc11 = ec.ndc11 AND 
                      (ec.fill_date::date BETWEEN awp.awp_effective_from_date AND COALESCE(awp.awp_effective_thru_date, '9999-12-31'::date))
                  LEFT JOIN edpm.mspan_ndc_info ndc ON ndc.ndc11 = ec.ndc11
              ),
              final_enrichment AS (
                  SELECT
                      record_id,
                      ndc11,
                      drug_label_name,
                      drug_name,
                      drug_classification,
                      is_in_formulary,
                      mspan_unit_price,
                      mspan_awp,
                      mspan_maint_drug_code,
                      mspan_multi_source_code,
                      reprice_gross_cost,
                      member_cost,
                      days_supply,
                      avg_rebate_per_DS,
                      
                      -- Plan Cost Calculation based on modeling type
                      CASE
                          -- Case 1: Use Claims File - Step 5.1
                          WHEN modeling_type = 'useClaimsFile' AND member_cost IS NOT NULL THEN
                              reprice_gross_cost - member_cost
                              
                          -- Case 2: Member Copays - Step 5.2
                          WHEN modeling_type = 'memberCopays' AND drug_classification IS NOT NULL THEN
                              reprice_gross_cost - NULLIF((general_info->'copayModeling'->'memberCopays'->>drug_classification)::numeric, 0)
                              
                          -- Case 3: Member Coinsurance - Step 5.3
                          WHEN modeling_type = 'memberCoinsurance' AND drug_classification IS NOT NULL THEN
                              reprice_gross_cost - LEAST(
                                  NULLIF((general_info->'copayModeling'->'memberCoinsurance'->drug_classification->>'percentage')::numeric, 0) * reprice_gross_cost / 100,
                                  NULLIF((general_info->'copayModeling'->'memberCoinsurance'->drug_classification->>'maximum')::numeric, 0)
                              )
                          
                          -- Default
                          ELSE reprice_gross_cost
                      END as reprice_plan_cost
                  FROM enrichment_data
              ),
              complete_enrichment AS (
                  SELECT
                      record_id,
                      ndc11,
                      drug_label_name,
                      drug_name,
                      drug_classification,
                      is_in_formulary,
                      mspan_unit_price,
                      mspan_awp,
                      mspan_maint_drug_code,
                      mspan_multi_source_code,
                      reprice_gross_cost,
                      reprice_plan_cost,
                      
                      -- Calculate Net Plan Cost
                      CASE
                          WHEN avg_rebate_per_DS > 0 AND days_supply > 0 THEN
                              reprice_plan_cost - (avg_rebate_per_DS * days_supply)
                          ELSE
                              reprice_plan_cost
                      END as reprice_net_plan_cost
                  FROM final_enrichment
              )
              UPDATE claim_records cr
              SET 
                  lookup_fields = COALESCE(cr.lookup_fields, '{}'::jsonb) || jsonb_build_object(
                      'ndc11', ce.ndc11,
                      'drug_label_name', ce.drug_label_name,
                      'drug_name', ce.drug_name,
                      'is_in_formulary', ce.is_in_formulary,
                      'mspan_unit_price', ce.mspan_unit_price,
                      'mspan_awp', ce.mspan_awp,
                      'mspan_maint_drug_code', ce.mspan_maint_drug_code,
                      'mspan_multi_source_code', ce.mspan_multi_source_code,
                      'drug_classification', ce.drug_classification,
                      'reprice_gross_cost', ce.reprice_gross_cost,
                      'reprice_plan_cost', ce.reprice_plan_cost,
                      'reprice_net_plan_cost', ce.reprice_net_plan_cost
                  ),
                  updated_at = CURRENT_TIMESTAMP,
                  updated_by = 'lambda-enrichment'
              FROM complete_enrichment ce
              WHERE cr.record_id = ce.record_id
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
          
          // Log statistics about MSPAN data enrichment
          const mspanStatsQuery = `
              SELECT 
                  COUNT(*) as total_processed,
                  COUNT(CASE WHEN lookup_fields->>'mspan_unit_price' IS NOT NULL THEN 1 END) as with_unit_price,
                  COUNT(CASE WHEN lookup_fields->>'mspan_awp' IS NOT NULL THEN 1 END) as with_awp,
                  COUNT(CASE WHEN lookup_fields->>'drug_classification' IS NOT NULL THEN 1 END) as with_classification,
                  COUNT(CASE WHEN lookup_fields->>'reprice_gross_cost' IS NOT NULL THEN 1 END) as with_reprice,
                  COUNT(CASE WHEN lookup_fields->>'reprice_plan_cost' IS NOT NULL THEN 1 END) as with_plan_cost,
                  COUNT(CASE WHEN lookup_fields->>'reprice_net_plan_cost' IS NOT NULL THEN 1 END) as with_net_plan_cost
              FROM claim_records
              WHERE file_id = $1 
              AND row_number BETWEEN $2 AND $3
          `;
          
          const statsResult = await client.query(mspanStatsQuery, [fileId, startRow, endRow]);
          const mspanStats = statsResult.rows[0];
          
          console.log(`Drug enrichment statistics: `, mspanStats);
          
          return {
              totalProcessed: totalRecords,
              enriched: enrichedCount,
              failed: failedCount,
              details: {
                  attemptedNdcLookups: enrichedCount + failedCount,
                  mspanUnitPriceMatch: parseInt(mspanStats.with_unit_price || '0'),
                  withClassification: parseInt(mspanStats.with_classification || '0'),
                  withRepriceCalculated: parseInt(mspanStats.with_reprice || '0'),
                  withPlanCost: parseInt(mspanStats.with_plan_cost || '0'),
                  withNetPlanCost: parseInt(mspanStats.with_net_plan_cost || '0')
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