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
     * Enriches claims with drug information from MSPAN tables and calculated pricing fields
     * Stores results in the lookup_fields column of claim_records
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
-- First determine drug classification in a separate CTE
drug_classification_cte AS (
    SELECT 
        ec.record_id,
        ec.ndc11,
        ec.formulary,
        ec.modeling_type,
        ec.general_info,
        ec.fill_date,
        ec.quantity,
        ec.member_cost,
        ec.days_supply,
        dm.drug_label_name,
        dm.drug_name,
        dm.specialty_indicator,
        dm.brnd_gnrc,
        dm.tier,
        dm.is_closed_formulary,
        dm.is_open_formulary,
        dm.awp_discount,
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
        
        -- Check if drug is in the selected formulary
        CASE
            WHEN ec.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y' THEN true
            WHEN ec.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y' THEN true
            ELSE false
        END as is_in_formulary,
        
        -- Classification flags from drugs_master
        dm.questionable_clinical_effectiveness as orig_questionable_clinical_effectiveness,
        dm.medical_benefit_only as orig_medical_benefit_only,
        dm.lcv_wow as orig_lcv_wow,
        dm.abortifacient as orig_abortifacient,
        dm.weight_loss_inj as orig_weight_loss_inj,
        dm.weight_loss_oral as orig_weight_loss_oral,
        dm.fertility as orig_fertility,
        dm.growth_hormone as orig_growth_hormone,
        dm.desi as orig_desi,
        dm.otc_drug_ind as orig_otc_drug_ind,
        
        -- Include the average rebate per day supply value
        dm.avg_rebate_per_DS
    FROM enrichable_claims ec
    LEFT JOIN drugs_master dm ON dm.ndc11 = ec.ndc11
),
enrichment_data AS (
    SELECT 
        dc.record_id,
        dc.ndc11,
        dc.formulary,
        dc.modeling_type,
        dc.general_info,
        dc.drug_label_name,
        dc.drug_name,
        dc.drug_classification,
        dc.is_in_formulary,
        awp.unit_price as mspan_unit_price,
        CASE 
            WHEN awp.unit_price IS NOT NULL AND dc.quantity IS NOT NULL 
            THEN awp.unit_price * NULLIF(dc.quantity::numeric, 0) 
            ELSE NULL 
        END as mspan_awp,
        dc.specialty_indicator,
        dc.brnd_gnrc,
        dc.tier,
        dc.is_closed_formulary,
        dc.is_open_formulary,
        dc.days_supply::numeric as days_supply,
        dc.awp_discount::numeric as awp_discount,
        dc.member_cost::numeric as member_cost,
        
        -- Classification flags
        dc.orig_questionable_clinical_effectiveness,
        dc.orig_medical_benefit_only,
        dc.orig_lcv_wow,
        dc.orig_abortifacient,
        dc.orig_weight_loss_inj,
        dc.orig_weight_loss_oral,
        dc.orig_fertility,
        dc.orig_growth_hormone,
        dc.orig_desi,
        dc.orig_otc_drug_ind,
        
        -- Include the average rebate per day supply value
        dc.avg_rebate_per_DS,
        
        -- Calculate Gross Cost with updated AWP discount logic (Step 4)
        CASE 
            WHEN awp.unit_price IS NOT NULL AND dc.quantity IS NOT NULL THEN
                CASE 
                    -- Specialty drugs use the discount from drugs_master
                    WHEN dc.specialty_indicator = 'Y' THEN 
                        (1 - COALESCE(dc.awp_discount::numeric, 0)) * (awp.unit_price * NULLIF(dc.quantity::numeric, 0))
                    -- Non-specialty drugs use conditional discount based on brand/generic and days_supply
                    ELSE 
                        CASE 
                            -- Brand ≤ 30 days
                            WHEN dc.brnd_gnrc LIKE 'B%' AND dc.days_supply::numeric <= 30 THEN 
                                (1 - 0.20) * (awp.unit_price * NULLIF(dc.quantity::numeric, 0))
                            -- Generic ≤ 30 days
                            WHEN dc.brnd_gnrc LIKE 'G%' AND dc.days_supply::numeric <= 30 THEN 
                                (1 - 0.87) * (awp.unit_price * NULLIF(dc.quantity::numeric, 0))
                            -- Brand > 30 and ≤ 90 days
                            WHEN dc.brnd_gnrc LIKE 'B%' AND dc.days_supply::numeric > 30 AND dc.days_supply::numeric <= 90 THEN 
                                (1 - 0.215) * (awp.unit_price * NULLIF(dc.quantity::numeric, 0))
                            -- Generic > 30 and ≤ 90 days
                            WHEN dc.brnd_gnrc LIKE 'G%' AND dc.days_supply::numeric > 30 AND dc.days_supply::numeric <= 90 THEN 
                                (1 - 0.89) * (awp.unit_price * NULLIF(dc.quantity::numeric, 0))
                            -- Default case if no condition matches
                            ELSE (1 - COALESCE(dc.awp_discount::numeric, 0)) * (awp.unit_price * NULLIF(dc.quantity::numeric, 0))
                        END
                END
            ELSE NULL
        END as reprice_gross_cost,
        
        -- Get average rebate per day supply
        CASE 
            WHEN dc.brnd_gnrc LIKE 'B%' THEN
                -- Extract appropriate rebate based on category from drugs_master
                COALESCE(dc.avg_rebate_per_DS, 0)
            ELSE 0 -- No rebates for generics
        END as normalized_avg_rebate_per_DS,
        
        -- Member copay logic with proper casting
        CASE
            WHEN dc.modeling_type = 'useClaimsFile' AND dc.member_cost IS NOT NULL THEN
                dc.member_cost::numeric
            WHEN dc.modeling_type = 'memberCopays' AND dc.drug_classification IS NOT NULL THEN
                CASE
                    WHEN dc.general_info->'copayModeling'->'memberCopays'->>dc.drug_classification IS NULL 
                        OR dc.general_info->'copayModeling'->'memberCopays'->>dc.drug_classification = '' THEN NULL::numeric
                    ELSE (dc.general_info->'copayModeling'->'memberCopays'->>dc.drug_classification)::numeric
                END
            WHEN dc.modeling_type = 'memberCoinsurance' AND dc.drug_classification IS NOT NULL THEN
                -- Coinsurance calculation logic (abbreviated for brevity)
                NULL::numeric
            ELSE NULL::numeric
        END as member_copay
        
    FROM drug_classification_cte dc
    LEFT JOIN edpm.mspan_awp_info awp ON 
        awp.ndc11 = dc.ndc11 AND 
        (dc.fill_date::date BETWEEN awp.awp_effective_from_date AND COALESCE(awp.awp_effective_thru_date, '9999-12-31'::date))
    LEFT JOIN edpm.mspan_ndc_info ndc ON ndc.ndc11 = dc.ndc11
),
enrichment_data_with_plan_cost AS (
    SELECT
        ed.*,
        -- Plan Cost Calculation based on modeling type with proper casting
        CASE
            -- Case 1: Use Claims File - Step 5.1
            WHEN ed.modeling_type = 'useClaimsFile' AND ed.member_cost IS NOT NULL THEN
                GREATEST(ed.reprice_gross_cost - ed.member_cost::numeric, 0)
                
            -- Case 2: Member Copays - Step 5.2
            WHEN ed.modeling_type = 'memberCopays' AND ed.drug_classification IS NOT NULL THEN
                GREATEST(ed.reprice_gross_cost - NULLIF((ed.general_info->'copayModeling'->'memberCopays'->>ed.drug_classification)::numeric, 0),0)
                
            -- Case 3: Member Coinsurance - Step 5.3
            WHEN ed.modeling_type = 'memberCoinsurance' AND ed.drug_classification IS NOT NULL THEN
                GREATEST(ed.reprice_gross_cost - LEAST(
                    NULLIF((ed.general_info->'copayModeling'->'memberCoinsurance'->ed.drug_classification->>'percentage')::numeric, 0) * ed.reprice_gross_cost / 100,
                    NULLIF((ed.general_info->'copayModeling'->'memberCoinsurance'->ed.drug_classification->>'maximum')::numeric, 0)
                ),0)
            
            -- Default
            ELSE ed.reprice_gross_cost
        END as reprice_plan_cost
    FROM
        enrichment_data ed
),
final_enrichment AS (
    SELECT
        record_id,
        ndc11,
        drug_label_name,
        drug_name,
        is_in_formulary,
        mspan_unit_price,
        mspan_awp as reprice_awp,
        reprice_gross_cost,
        reprice_plan_cost,
        member_copay,
        days_supply,
        normalized_avg_rebate_per_DS,
        COALESCE(orig_questionable_clinical_effectiveness, 'N') as questionable_clinical_effectiveness,
        COALESCE(orig_medical_benefit_only, 'N') as medical_benefit_only,
        COALESCE(orig_lcv_wow, 'N') as lcv_wow,
        COALESCE(orig_abortifacient, 'N') as abortifacient,
        COALESCE(orig_weight_loss_inj, 'N') as weight_loss_inj,
        COALESCE(orig_weight_loss_oral, 'N') as weight_loss_oral,
        COALESCE(orig_fertility, 'N') as fertility,
        COALESCE(orig_growth_hormone, 'N') as growth_hormone,
        COALESCE(orig_desi, 'N') as desi,
        COALESCE(orig_otc_drug_ind, 'N') as otc_drug_ind,
        specialty_indicator,
        brnd_gnrc,
        CASE 
            WHEN specialty_indicator = 'Y' THEN COALESCE(awp_discount, 0)
            ELSE 
                CASE 
                    WHEN brnd_gnrc LIKE 'B%' AND days_supply <= 30 THEN 0.20
                    WHEN brnd_gnrc LIKE 'G%' AND days_supply <= 30 THEN 0.87
                    WHEN brnd_gnrc LIKE 'B%' AND days_supply > 30 THEN 0.215
                    WHEN brnd_gnrc LIKE 'G%' AND days_supply > 30 THEN 0.89
                    ELSE COALESCE(awp_discount, 0)
                END
        END as applied_awp_discount,
        
        -- Calculate Net Plan Cost
        CASE
            WHEN normalized_avg_rebate_per_DS > 0 AND days_supply > 0 THEN
                reprice_plan_cost - (normalized_avg_rebate_per_DS * days_supply)
            ELSE
                reprice_plan_cost
        END as reprice_net_plan_cost
    FROM enrichment_data_with_plan_cost
),
complete_enrichment AS (
    SELECT
        record_id,
        ndc11,
        drug_label_name,
        drug_name,
        is_in_formulary,
        mspan_unit_price,
        reprice_awp,
        reprice_gross_cost,
        reprice_plan_cost,
        member_copay,
        questionable_clinical_effectiveness,
        medical_benefit_only,
        lcv_wow,
        abortifacient,
        weight_loss_inj,
        weight_loss_oral,
        fertility,
        growth_hormone,
        desi,
        otc_drug_ind,
        applied_awp_discount,
        normalized_avg_rebate_per_DS as avg_rebate_per_DS,
        specialty_indicator,
        brnd_gnrc,
        reprice_net_plan_cost
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
        'reprice_awp', ce.reprice_awp,
        'member_copay', ce.member_copay,
        'reprice_gross_cost', ce.reprice_gross_cost,
        'reprice_plan_cost', ce.reprice_plan_cost,
        'reprice_net_plan_cost', ce.reprice_net_plan_cost,
        'questionable_clinical_effectiveness', ce.questionable_clinical_effectiveness,
        'medical_benefit_only', ce.medical_benefit_only,
        'lcv_wow', ce.lcv_wow,
        'abortifacient', ce.abortifacient,
        'weight_loss_inj', ce.weight_loss_inj,
        'weight_loss_oral', ce.weight_loss_oral,
        'fertility', ce.fertility,
        'growth_hormone', ce.growth_hormone,
        'desi', ce.desi,
        'otc_drug_ind', ce.otc_drug_ind,
        'applied_awp_discount', ce.applied_awp_discount,
        'avg_rebate_per_DS', ce.avg_rebate_per_DS
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
                  COUNT(CASE WHEN lookup_fields->>'reprice_awp' IS NOT NULL THEN 1 END) as with_awp,
                  COUNT(CASE WHEN lookup_fields->>'member_copay' IS NOT NULL THEN 1 END) as with_member_copay,
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
                    withMemberCopay: parseInt(mspanStats.with_member_copay || '0'),
                    withRepriceCalculated: parseInt(mspanStats.with_reprice || '0'),
                    withPlanCost: parseInt(mspanStats.with_plan_cost || '0'),
                    withNetPlanCost: parseInt(mspanStats.with_net_plan_cost || '0')
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