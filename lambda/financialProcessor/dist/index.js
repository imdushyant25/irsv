"use strict";
// File: lambda/financialProcessor/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const pg_1 = require("pg");
const uuid_1 = require("uuid");
// Database connection configuration
const dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    statement_timeout: 300000, // 5 minutes
    query_timeout: 300000, // 5 minutes
    idle_in_transaction_session_timeout: 300000
};
/**
 * Main Lambda handler for financial analysis
 */
const handler = async (event) => {
    console.log('Starting financial analysis with event:', JSON.stringify(event));
    const { fileId, opportunityId } = event;
    if (!fileId || !opportunityId) {
        throw new Error('Missing required parameters: fileId and opportunityId are required.');
    }
    const client = new pg_1.Client(dbConfig);
    try {
        await client.connect();
        if (process.env.DB_SCHEMA) {
            await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
        }
        // Run all analyses in parallel
        console.log('Starting HDHP, ACA, Rebate, RDS, PAP, HANS, MA, CCI, MCAP, IDS, SPP, and DAW analyses in parallel');
        const [hdgpResults, acaResults, rebateResults, rdsResults, papResults, hansResults, maResults, cciResults, mcapResults, idsResults, sppResults, dawResults] = await Promise.all([
            analyzeHdhpPreventive(client, fileId),
            analyzeAcaPreventive(client, fileId),
            analyzeRebateFinancial(client, fileId),
            analyzeRdsFinancial(client, fileId),
            analyzePapFinancial(client, fileId),
            analyzeHansFinancial(client, fileId),
            analyzeMaintenanceAcute(client, fileId),
            analyzeWeightBased(client, fileId),
            analyzeMcap(client, fileId),
            analyzeIds(client, fileId),
            analyzeParityPricing(client, fileId),
            analyzeDawPenalties(client, fileId)
        ]);
        // Save all results in parallel
        await Promise.all([
            saveResultsToDatabase(client, fileId, 'fcHDHP', hdgpResults),
            saveResultsToDatabase(client, fileId, 'fcACA', acaResults),
            saveResultsToDatabase(client, fileId, 'fcRebate', rebateResults),
            saveResultsToDatabase(client, fileId, 'fcRDS', rdsResults),
            saveResultsToDatabase(client, fileId, 'fcPAP', papResults),
            saveResultsToDatabase(client, fileId, 'fcHANS', hansResults),
            saveResultsToDatabase(client, fileId, 'fcMA', maResults),
            saveResultsToDatabase(client, fileId, 'fcCCI', cciResults),
            saveResultsToDatabase(client, fileId, 'fcMCAP', mcapResults),
            saveResultsToDatabase(client, fileId, 'fcIDS', idsResults),
            saveResultsToDatabase(client, fileId, 'fcSPP', sppResults),
            saveResultsToDatabase(client, fileId, 'fcDAW', dawResults)
        ]);
        console.log('HDHP, ACA, Rebate, RDS, PAP, HANS, MA, CCI, MCAP, IDS, SPP, and DAW analyses completed and saved in parallel');
        return {
            statusCode: 200,
            body: {
                message: 'Financial analysis completed successfully',
                fileId,
                opportunityId,
                hdgpResults,
                acaResults,
                rebateResults,
                rdsResults,
                papResults,
                hansResults,
                maResults,
                cciResults,
                mcapResults,
                idsResults,
                sppResults,
                dawResults
            }
        };
    }
    catch (error) {
        console.error('Error during financial analysis:', error);
        return {
            statusCode: 500,
            body: {
                message: 'Financial analysis failed',
                error: error instanceof Error ? error.message : String(error)
            }
        };
    }
    finally {
        try {
            await client.end();
        }
        catch (e) {
            console.error('Error closing client:', e);
        }
    }
};
exports.handler = handler;
/**
 * Analyze HDHP preventive drug savings
 */
async function analyzeHdhpPreventive(client, fileId) {
    const query = `
WITH base_claims AS (
  SELECT
    cr.record_id,
    cr.mapped_fields->>'member_id' AS member_id,
    cr.mapped_fields->>'preventive_drug_irs' AS incumbent_preventive,
    dm.is_hdhp AS illuminate_preventive,
    COALESCE((cr.lookup_fields->>'reprice_net_plan_cost')::numeric, 0) AS net_plan_cost,
    COALESCE((cr.lookup_fields->>'member_copay')::numeric, 0) AS member_copay
  FROM claim_records cr
  LEFT JOIN drugs_master dm
    ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
  WHERE cr.file_id = $1
   -- AND cr.lookup_fields->>'is_in_formulary' = 'true'
),

categorized_claims AS (
  SELECT
    record_id,
    member_id,
    CASE
      -- With Incumbent Indicator
      WHEN incumbent_preventive = 'Y' AND illuminate_preventive = 'Y' THEN 'No Change'
      WHEN incumbent_preventive = 'Y' AND illuminate_preventive IS DISTINCT FROM 'Y' THEN 'Plan Savings'
      WHEN incumbent_preventive = 'N' AND illuminate_preventive = 'Y' THEN 'Plan Expense'

      -- Without Incumbent Indicator
      WHEN incumbent_preventive IS NULL AND illuminate_preventive = 'Y' AND member_copay = 0 THEN 'No Change'
      WHEN incumbent_preventive IS NULL AND illuminate_preventive = 'Y' AND member_copay > 0 THEN 'Plan Expense'

      -- Not Evaluated
      WHEN illuminate_preventive IS DISTINCT FROM 'Y' AND incumbent_preventive IS NULL THEN 'Claims Not Evaluated'

      ELSE NULL
    END AS category,
    CASE
      WHEN incumbent_preventive = 'Y' AND illuminate_preventive = 'Y' THEN 0
      WHEN incumbent_preventive = 'Y' AND illuminate_preventive IS DISTINCT FROM 'Y' THEN net_plan_cost
      WHEN incumbent_preventive = 'N' AND illuminate_preventive = 'Y' THEN member_copay
      WHEN incumbent_preventive IS NULL AND illuminate_preventive = 'Y' AND member_copay = 0 THEN 0
      WHEN incumbent_preventive IS NULL AND illuminate_preventive = 'Y' AND member_copay > 0 THEN member_copay
      ELSE 0
    END AS cost
  FROM base_claims
),

summary AS (
  SELECT
    category,
    SUM(cost) AS total_cost,
    COUNT(DISTINCT member_id) AS impacted_members,
    COUNT(*) AS claim_count
  FROM categorized_claims
  WHERE category IS NOT NULL
  GROUP BY category
)

SELECT json_agg(summary) AS hdhp_preventive_summary
FROM summary;
  `;
    try {
        const result = await client.query(query, [fileId]);
        return result.rows[0]?.hdhp_preventive_summary || [];
    }
    catch (error) {
        console.error('Error during HDHP preventive analysis:', error);
        throw error;
    }
}
/**
 * Analyze ACA preventive drug savings
 */
async function analyzeAcaPreventive(client, fileId) {
    const query = `
WITH base_claims AS (
  SELECT
    cr.record_id,
    cr.mapped_fields->>'member_id' AS member_id,
    cr.mapped_fields->>'preventive_drug' AS incumbent_preventive,
    dm.is_aca AS illuminate_preventive,
    COALESCE((cr.lookup_fields->>'reprice_net_plan_cost')::numeric, 0) AS net_plan_cost,
    COALESCE((cr.lookup_fields->>'member_copay')::numeric, 0) AS member_copay
  FROM claim_records cr
  LEFT JOIN drugs_master dm
    ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
  WHERE cr.file_id = $1
   -- AND cr.lookup_fields->>'is_in_formulary' = 'true'
),

categorized_claims AS (
  SELECT
    record_id,
    member_id,
    CASE
      -- With Incumbent Indicator
      WHEN incumbent_preventive = 'Y' AND illuminate_preventive = 'Y' THEN 'No Change'
      WHEN incumbent_preventive = 'Y' AND illuminate_preventive IS DISTINCT FROM 'Y' THEN 'Plan Savings'
      WHEN incumbent_preventive = 'N' AND illuminate_preventive = 'Y' THEN 'Plan Expense'

      -- Without Incumbent Indicator
      WHEN incumbent_preventive IS NULL AND illuminate_preventive = 'Y' AND member_copay = 0 THEN 'No Change'
      WHEN incumbent_preventive IS NULL AND illuminate_preventive = 'Y' AND member_copay > 0 THEN 'Plan Expense'

      -- Not Evaluated
      WHEN illuminate_preventive IS DISTINCT FROM 'Y' AND incumbent_preventive IS NULL THEN 'Claims Not Evaluated'

      ELSE NULL
    END AS category,
    CASE
      WHEN incumbent_preventive = 'Y' AND illuminate_preventive = 'Y' THEN 0
      WHEN incumbent_preventive = 'Y' AND illuminate_preventive IS DISTINCT FROM 'Y' THEN net_plan_cost
      WHEN incumbent_preventive = 'N' AND illuminate_preventive = 'Y' THEN member_copay
      WHEN incumbent_preventive IS NULL AND illuminate_preventive = 'Y' AND member_copay = 0 THEN 0
      WHEN incumbent_preventive IS NULL AND illuminate_preventive = 'Y' AND member_copay > 0 THEN member_copay
      ELSE 0
    END AS cost
  FROM base_claims
),

summary AS (
  SELECT
    category,
    SUM(cost) AS total_cost,
    COUNT(DISTINCT member_id) AS impacted_members,
    COUNT(*) AS claim_count
  FROM categorized_claims
  WHERE category IS NOT NULL
  GROUP BY category
)

SELECT json_agg(summary) AS aca_preventive_summary
FROM summary;
  `;
    try {
        const result = await client.query(query, [fileId]);
        return result.rows[0]?.aca_preventive_summary || [];
    }
    catch (error) {
        console.error('Error during ACA preventive analysis:', error);
        throw error;
    }
}
/**
 * Analyze rebate eligibility
 */
async function analyzeRebateFinancial(client, fileId) {
    const query = `
    WITH brand_claims AS (
      SELECT
        cr.record_id,
        cr.mapped_fields->>'member_id' AS member_id,
        COALESCE((cr.lookup_fields->>'reprice_plan_cost')::numeric, 0) AS plan_cost,
        dm.is_rebate_elig = 'Y' AS is_rebate_eligible
      FROM claim_records cr
      JOIN drugs_master dm
        ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
      WHERE cr.file_id = $1
        AND LEFT(cr.lookup_fields->>'brnd_gnrc', 1) = 'B' -- Only brand drugs
        AND cr.lookup_fields->>'is_in_formulary' = 'true'
    ),
    eligible_claims AS (
      SELECT *
      FROM brand_claims
      WHERE is_rebate_eligible
    )
    SELECT json_build_object(
      'eligible_claim_count', COUNT(*)::int,
      'eligible_member_count', COUNT(DISTINCT member_id),
      'total_plan_cost', ROUND(SUM(plan_cost), 2)
    ) AS rebate_financial_callout
    FROM eligible_claims;
  `;
    try {
        const result = await client.query(query, [fileId]);
        return result.rows[0]?.rebate_financial_callout || {
            eligible_claim_count: 0,
            eligible_member_count: 0,
            total_plan_cost: 0
        };
    }
    catch (error) {
        console.error('Error during rebate financial analysis:', error);
        throw error;
    }
}
/**
 * Analyze Retiree Drug Subsidy (RDS) eligibility
 */
async function analyzeRdsFinancial(client, fileId) {
    const query = `
      WITH rds_candidates AS (
  SELECT
    cr.mapped_fields->>'member_id' AS member_id,
    COALESCE((cr.lookup_fields->>'reprice_plan_cost')::numeric, 0) AS plan_cost
  FROM claim_records cr
  WHERE cr.file_id = $1
    AND COALESCE((cr.dynamic_fields->'ageEnrichment'->>'ageAtFillDate')::int, 0) >= 65
    AND cr.lookup_fields->>'is_in_formulary' = 'true'
),
per_member_costs AS (
  SELECT
    member_id,
    SUM(plan_cost) AS total_cost
  FROM rds_candidates
  GROUP BY member_id
),
eligible_members AS (
  SELECT
    member_id,
    LEAST(total_cost, 12150) AS capped_cost
  FROM per_member_costs
  WHERE total_cost >= 590
)
SELECT json_build_object(
  'eligible_member_count', COUNT(*)::int,
  'total_rds_plan_cost', ROUND(SUM(capped_cost), 2),
  'estimated_rds_savings', ROUND((SUM(capped_cost) - (COUNT(*) * 590)) * 0.28, 2)
) AS rds_financial_callout
FROM eligible_members;
  `;
    try {
        const result = await client.query(query, [fileId]);
        return result.rows[0]?.rds_financial_callout || {
            eligible_member_count: 0,
            total_rds_plan_cost: 0,
            estimated_rds_savings: 0
        };
    }
    catch (error) {
        console.error('Error during RDS financial analysis:', error);
        throw error;
    }
}
/**
 * Analyze Patient Assistance Program (PAP) financial impact
 */
async function analyzePapFinancial(client, fileId) {
    const query = `
    WITH pap_plan_excluded_claims AS (
  SELECT
    cr.record_id,
    cr.mapped_fields->>'member_id' AS member_id,
    COALESCE((cr.mapped_fields->>'plan_cost')::numeric, 0) AS plan_cost
  FROM edpm.claim_records cr
  WHERE cr.file_id = $1
    AND cr.lookup_fields->>'pap' = 'Y'
    AND cr.exclusion_type = 'Plan'
),
pap_metrics AS (
  SELECT
    COUNT(*) AS total_pap_claims,
    COUNT(DISTINCT member_id) AS impacted_members,
    ROUND(SUM(plan_cost), 2) AS pap_gross_cost,
    ROUND(SUM(plan_cost) * 0.25, 2) AS pap_fees,
    ROUND(SUM(plan_cost) * 0.75, 2) AS pap_savings
  FROM pap_plan_excluded_claims
)
SELECT json_build_object(
  'total_pap_claims', total_pap_claims,
  'impacted_members', impacted_members,
  'pap_gross_cost', pap_gross_cost,
  'pap_fees', pap_fees,
  'pap_savings', pap_savings
) AS pap_financial_callout
FROM pap_metrics;
  `;
    try {
        const result = await client.query(query, [fileId]);
        const papData = result.rows[0]?.pap_financial_callout || {
            total_pap_claims: 0,
            impacted_members: 0,
            pap_gross_cost: 0,
            pap_fees: 0,
            pap_savings: 0
        };
        // Handle null values from SQL when no data is found
        if (papData.pap_gross_cost === null)
            papData.pap_gross_cost = 0;
        if (papData.pap_fees === null)
            papData.pap_fees = 0;
        if (papData.pap_savings === null)
            papData.pap_savings = 0;
        return papData;
    }
    catch (error) {
        console.error('Error during PAP financial analysis:', error);
        throw error;
    }
}
/**
 * Analyze Hospital at Home Network Solutions (HANS) financial impact
 */
async function analyzeHansFinancial(client, fileId) {
    const query = `
    WITH hans_claims AS (
      SELECT
        cr.record_id,
        cr.mapped_fields->>'member_id' AS member_id,
        COALESCE((cr.mapped_fields->>'gross_cost')::numeric, 0) AS plan_cost,
        COALESCE((cr.lookup_fields->>'quantity')::numeric, 0) AS quantity,
        COALESCE(dm.hans_unit_cost::numeric, 0) AS hans_unit_cost
      FROM claim_records cr
      JOIN drugs_master dm
        ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
      WHERE cr.file_id = $1
        AND cr.lookup_fields->>'hans' = 'Y'
        AND cr.lookup_fields->>'is_in_formulary' = 'true'
    ),
    aggregated AS (
      SELECT
        COUNT(*) AS total_claims,
        COUNT(DISTINCT member_id) AS impacted_members,
        ROUND(SUM(plan_cost) - SUM(quantity * hans_unit_cost), 2) AS savings
      FROM hans_claims
    )
    SELECT json_build_object(
      'total_claims', total_claims,
      'impacted_members', impacted_members,
      'savings', savings
    ) AS hans_financial_callout
    FROM aggregated;
  `;
    try {
        const result = await client.query(query, [fileId]);
        const hansData = result.rows[0]?.hans_financial_callout || {
            total_claims: 0,
            impacted_members: 0,
            savings: 0
        };
        // Handle null values from SQL when no data is found
        if (hansData.savings === null)
            hansData.savings = 0;
        return hansData;
    }
    catch (error) {
        console.error('Error during HANS financial analysis:', error);
        throw error;
    }
}
/**
 * Analyze Maintenance and Acute Medication distribution
 */
async function analyzeMaintenanceAcute(client, fileId) {
    const query = `
    WITH base_claims AS (
      SELECT
        cr.record_id,
        cr.mapped_fields->>'member_id' AS member_id,
        COALESCE((cr.lookup_fields->>'reprice_plan_cost')::numeric, 0) AS plan_cost,
        CASE 
          WHEN mni.mspan_maint_drug_code = 'Y' THEN 'Maintenance'
          ELSE 'Acute'
        END AS medication_type
      FROM claim_records cr
      JOIN mspan_ndc_info mni
        ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = mni.ndc11
      WHERE cr.file_id = $1
      AND cr.lookup_fields->>'is_in_formulary' = 'true'
    ),
    aggregated AS (
      SELECT
        medication_type,
        COUNT(*) AS total_claims,
        COUNT(DISTINCT member_id) AS impacted_members,
        ROUND(SUM(plan_cost), 2) AS total_plan_cost
      FROM base_claims
      GROUP BY medication_type
    )
    SELECT json_agg(
      json_build_object(
        'medication_type', medication_type,
        'total_claims', total_claims,
        'impacted_members', impacted_members,
        'total_plan_cost', total_plan_cost
      )
    ) AS maintenance_acute_summary
    FROM aggregated;
  `;
    try {
        const result = await client.query(query, [fileId]);
        return result.rows[0]?.maintenance_acute_summary || [];
    }
    catch (error) {
        console.error('Error during maintenance/acute analysis:', error);
        throw error;
    }
}
/**
 * Analyze Weight Based claims
 */
async function analyzeWeightBased(client, fileId) {
    const query = `
    WITH weight_claims AS (
      SELECT 
        cr.record_id,
        LPAD(cr.lookup_fields->>'ndc11', 11, '0') AS ndc11,
        (cr.lookup_fields->>'reprice_plan_cost')::numeric AS plan_cost,
        cr.mapped_fields->>'member_id' AS member_id
      FROM claim_records cr
      JOIN cci_weight_based cci 
        ON cci.ndc11 = LPAD(cr.lookup_fields->>'ndc11', 11, '0')
      WHERE cr.file_id = $1
      AND cr.lookup_fields->>'is_in_formulary' = 'true'
    ),
    summary AS (
      SELECT 
        COUNT(*) AS total_weight_claims,
        SUM(plan_cost) AS total_cost,
        COUNT(DISTINCT member_id) AS impacted_members
      FROM weight_claims
    )
    SELECT row_to_json(summary) AS result FROM summary;
  `;
    try {
        const result = await client.query(query, [fileId]);
        return result.rows[0]?.result || { total_weight_claims: 0, total_cost: 0, impacted_members: 0 };
    }
    catch (error) {
        console.error('Error during weight based analysis:', error);
        throw error;
    }
}
/**
 * Analyze MCAP claims
 */
async function analyzeMcap(client, fileId) {
    const query = `
    WITH mcap_claims AS (
      SELECT
        cr.record_id,
        cr.file_id,
        cr.mapped_fields->>'member_id' AS member_id,
        (cr.lookup_fields->>'days_supply')::numeric AS days_supply,
        (cr.lookup_fields->>'member_copay')::numeric AS member_copay,
        LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') AS ndc11,
        dm.map_offset_per_ds::numeric AS map_offset_per_ds,
        (dm.map_offset_per_ds::numeric * (cr.lookup_fields->>'days_supply')::numeric) 
            - (cr.lookup_fields->>'member_copay')::numeric AS mcap_savings
      FROM claim_records cr
      JOIN drugs_master dm ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
      WHERE cr.lookup_fields->>'mcap' = 'Y'
        AND cr.file_id = $1
        AND cr.lookup_fields->>'is_in_formulary' = 'true'
    ),
    savings_with_fees AS (
      SELECT
        member_id,
        record_id,
        ndc11,
        mcap_savings,
        ROUND(mcap_savings * 0.25, 2) AS fees,
        ROUND(mcap_savings * 0.75, 2) AS net_savings
      FROM mcap_claims
    ),
    summary AS (
      SELECT
        COUNT(DISTINCT member_id) AS member_count,
        COUNT(*) AS claim_count,
        ROUND(SUM(mcap_savings), 2) AS total_mcap_savings,
        ROUND(SUM(fees), 2) AS total_fees,
        ROUND(SUM(net_savings), 2) AS total_net_savings
      FROM savings_with_fees
    )
    SELECT jsonb_build_object(
      'member_count', member_count,
      'claim_count', claim_count,
      'total_mcap_savings', total_mcap_savings,
      'total_fees', total_fees,
      'total_net_savings', total_net_savings
    ) AS result_json
    FROM summary;
  `;
    try {
        const result = await client.query(query, [fileId]);
        return result.rows[0]?.result_json || {
            member_count: 0,
            claim_count: 0,
            total_mcap_savings: null,
            total_fees: null,
            total_net_savings: null
        };
    }
    catch (error) {
        console.error('Error during MCAP analysis:', error);
        throw error;
    }
}
/**
 * Analyze IDS claims
 */
async function analyzeIds(client, fileId) {
    const query = `
  WITH ids_claims AS (
  SELECT
    cr.record_id,
    cr.file_id,
    cr.mapped_fields->>'member_id' AS member_id,
    (cr.lookup_fields->>'reprice_plan_cost')::numeric AS reprice_gross_cost,
    (cr.lookup_fields->>'days_supply')::numeric AS days_supply,
    (cr.lookup_fields->>'quantity')::numeric AS quantity,
    LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') AS ndc11,
    dm.map_offset_per_ds::numeric AS map_offset_per_ds,
    dm.rxmanage_cost_per_qty::numeric AS rxmanage_cost_per_qty,

    -- Reprice minus MAP
    (cr.lookup_fields->>'reprice_plan_cost')::numeric 
      - (dm.map_offset_per_ds::numeric * (cr.lookup_fields->>'days_supply')::numeric) AS irx_less_map,

    -- RxManage Cost
    (dm.rxmanage_cost_per_qty::numeric * (cr.lookup_fields->>'quantity')::numeric) AS rxmanage_cost,

    -- Correct Per-Claim Savings
    ((cr.lookup_fields->>'reprice_plan_cost')::numeric 
      - (dm.map_offset_per_ds::numeric * (cr.lookup_fields->>'days_supply')::numeric)) 
    - (dm.rxmanage_cost_per_qty::numeric * (cr.lookup_fields->>'quantity')::numeric) AS claim_savings

  FROM edpm.claim_records cr
  JOIN edpm.drugs_master dm ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
  WHERE cr.lookup_fields->>'ids' = 'Y'
    AND cr.lookup_fields->>'is_in_formulary' = 'true'
    AND cr.file_id = $1
),
summary AS (
  SELECT
    COUNT(*) AS claim_count,
    COUNT(DISTINCT member_id) AS member_count,
    ROUND(SUM(irx_less_map), 2) AS total_irx_less_map,
    ROUND(SUM(rxmanage_cost), 2) AS total_rxmanage_cost,
    ROUND(SUM(irx_less_map) - SUM(rxmanage_cost), 2) AS total_savings
  FROM ids_claims
)
SELECT jsonb_build_object(
  'claim_count', claim_count,
  'member_count', member_count,
  'total_irx_less_map', total_irx_less_map,
  'total_rxmanage_cost', total_rxmanage_cost,
  'total_savings', total_savings
) AS result_json
FROM summary;
  `;
    try {
        const result = await client.query(query, [fileId]);
        return result.rows[0]?.result_json || {
            claim_count: 0,
            member_count: 0,
            total_irx_less_map: null,
            total_rxmanage_cost: null,
            total_savings: null
        };
    }
    catch (error) {
        console.error('Error during IDS analysis:', error);
        throw error;
    }
}
/**
 * Save analysis results to the savings_results table
 */
async function saveResultsToDatabase(client, fileId, category, results) {
    try {
        // Generate a new UUID for this result
        const resultId = (0, uuid_1.v4)();
        // Get user info for created_by field
        const createdBy = 'lambda-financial-processor';
        // First, delete any existing records for this file and category
        try {
            await client.query(`
        DELETE FROM savings_results 
        WHERE file_id = $1 AND category = $2
      `, [fileId, category]);
        }
        catch (deleteError) {
            console.log('No existing records to delete or error during deletion:', deleteError);
            // Continue with insert even if delete fails
        }
        // Insert query to save results
        const insertQuery = `
      INSERT INTO savings_results (
        id, 
        file_id, 
        category, 
        results, 
        created_at, 
        created_by
      ) VALUES (
        $1, $2, $3, $4, CURRENT_TIMESTAMP, $5
      )
    `;
        // Execute query with parameters
        await client.query(insertQuery, [
            resultId,
            fileId,
            category,
            JSON.stringify(results),
            createdBy
        ]);
        console.log(`Results saved to savings_results table for file ${fileId}, category: ${category}`);
    }
    catch (error) {
        console.error('Error saving results to database:', error);
        throw error;
    }
}
/**
 * Analyze Parity Pricing claims
 */
async function analyzeParityPricing(client, fileId) {
    const query = `
    SELECT jsonb_build_object(
        'total_exposure', SUM((cr.lookup_fields->>'reprice_plan_cost')::numeric),
        'parity_claim_count', COUNT(*),
        'impacted_members', COUNT(DISTINCT cr.mapped_fields->>'member_id')
    ) AS parity_priced_summary
    FROM claim_records cr
    JOIN cci_parity_priced cpp
        ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = cpp.ndc11
    WHERE cr.file_id = $1
    AND cr.lookup_fields->>'is_in_formulary' = 'true';
  `;
    try {
        const result = await client.query(query, [fileId]);
        return result.rows[0]?.parity_priced_summary || {
            total_exposure: null,
            impacted_members: 0,
            parity_claim_count: 0
        };
    }
    catch (error) {
        console.error('Error during parity pricing analysis:', error);
        throw error;
    }
}
/**
 * Analyze DAW Penalties
 */
async function analyzeDawPenalties(client, fileId) {
    const query = `
    WITH formulary_context AS (
    SELECT (lookup_fields->>'formulary') AS formulary
    FROM edpm.claim_records
    WHERE file_id = $1
    LIMIT 1
),

daw_claims AS (
    SELECT
        cr.record_id,
        (cr.mapped_fields->>'plan_cost')::numeric AS plan_cost,
        (cr.lookup_fields->>'days_supply')::numeric AS days_supply,
        cr.mapped_fields->>'member_id' AS member_id,
        cr.lookup_fields->>'specialty_indicator' AS specialty_indicator,
        dm.gpi14
    FROM edpm.claim_records cr
    JOIN edpm.drugs_master dm ON cr.lookup_fields->>'ndc11' = dm.ndc11
    WHERE cr.file_id = $1
      AND cr.lookup_fields->>'daw_penalty' = 'Y'
      AND cr.lookup_fields->>'is_in_formulary' = 'true'
      AND cr.lookup_fields->>'brnd_gnrc' LIKE 'B%'
),

generic_by_gpi14 AS (
    SELECT DISTINCT ON (dm.gpi14)
        dm.gpi14,
        dm.gpi14_awp_per_ds,
        dm.gpi14_avg_disc
    FROM edpm.drugs_master dm
    JOIN formulary_context fc ON TRUE
    WHERE dm.brnd_gnrc LIKE 'G%'
      AND (
            (fc.formulary = '4th PBM Closed Formulary' AND dm.is_closed_formulary = 'Y') OR
            (fc.formulary = '4th PBM Open Formulary' AND dm.is_open_formulary = 'Y')
      )
),

eligible_daw_claims AS (
    SELECT 
        dc.plan_cost,
        dc.member_id,
        (COALESCE(gr.gpi14_awp_per_ds, 0) * dc.days_supply) * 
            (1 - CASE 
                    WHEN dc.specialty_indicator = 'Y' THEN 0.8739
                    ELSE COALESCE(gr.gpi14_avg_disc, 0.5)
                 END) AS generic_gross_cost,

        dc.plan_cost - (
            (COALESCE(gr.gpi14_awp_per_ds, 0) * dc.days_supply) * 
            (1 - CASE 
                    WHEN dc.specialty_indicator = 'Y' THEN 0.8739
                    ELSE COALESCE(gr.gpi14_avg_disc, 0.5)
                 END)
        ) AS daw_savings
    FROM daw_claims dc
    JOIN generic_by_gpi14 gr ON dc.gpi14 = gr.gpi14
),

summary AS (
    SELECT
        COUNT(*) AS total_daw_claims,
        COUNT(DISTINCT member_id) AS impacted_members,
        SUM(daw_savings) AS total_daw_savings
    FROM eligible_daw_claims
)

SELECT row_to_json(summary) FROM summary;

  `;
    try {
        const result = await client.query(query, [fileId]);
        return result.rows[0]?.row_to_json || {
            total_daw_claims: 0,
            impacted_members: 0,
            total_daw_savings: null
        };
    }
    catch (error) {
        console.error('Error during DAW penalties analysis:', error);
        throw error;
    }
}
