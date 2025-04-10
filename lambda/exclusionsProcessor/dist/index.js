"use strict";
// File: lambda/exclusionsProcessor/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const pg_1 = require("pg");
// Connection configuration
const dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: {
        rejectUnauthorized: false
    }
};
/**
 * Main Lambda handler for exclusions analysis
 * @param event The Lambda event containing fileId and optional filter parameters
 */
const handler = async (event) => {
    console.log('Starting exclusions analysis with event:', JSON.stringify(event));
    const { fileId, filters } = event;
    // Validate required parameters
    if (!fileId) {
        throw new Error('Missing required parameter: fileId');
    }
    // Create a new client for this invocation
    const client = new pg_1.Client(dbConfig);
    try {
        // Connect to the database
        await client.connect();
        // Set schema if defined
        if (process.env.DB_SCHEMA) {
            await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
        }
        // Run the exclusions analysis query
        const result = await analyzeExclusions(client, fileId, filters);
        return {
            statusCode: 200,
            body: {
                message: 'Exclusions analysis completed successfully',
                fileId,
                result
            }
        };
    }
    catch (error) {
        console.error('Error during exclusions analysis:', error);
        throw error;
    }
    finally {
        // Close the client connection
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
 * Analyze claim exclusions for a given file
 * @param client Database client
 * @param fileId File ID to analyze
 * @param filters Optional category filters
 * @returns Analysis results
 */
async function analyzeExclusions(client, fileId, filters) {
    // Build the filter condition if filters array is provided
    let filterCondition = '';
    if (filters && filters.length > 0) {
        // Create a safe list of categories to include in the IN clause
        const safeCategories = filters.map(category => `'${category.replace(/'/g, "''")}'`).join(', ');
        filterCondition = `AND co.category IN (${safeCategories})`;
    }
    // Construct the query with parameterized file_id
    const query = `
  WITH 
  params AS (
    SELECT $1::uuid AS file_id
  ),
  base_records AS (
    -- Get all records for the file_id once to avoid repeated filtering
    SELECT
      (mapped_fields->>'member_id')::numeric AS member_id,
      (mapped_fields->>'plan_cost')::numeric AS plan_cost,
      (lookup_fields->>'gpi2_awp_per_ds')::numeric AS gpi2_awp_per_ds,
      lookup_fields->>'otc_drug_ind' = 'Y' AS is_otc_drug_ind,
      lookup_fields->>'desi' = 'Y' AS is_desi,
      lookup_fields->>'fertility' = 'Y' AS is_fertility,
      lookup_fields->>'growth_hormone' = 'Y' AS is_growth_hormone,
      lookup_fields->>'abortifacient' = 'Y' AS is_abortifacient,
      lookup_fields->>'weight_loss_inj' = 'Y' AS is_weight_loss_inj,
      lookup_fields->>'lcv_wow' = 'Y' AS is_lcv_wow,
      lookup_fields->>'weight_loss_oral' = 'Y' AS is_weight_loss_oral,
      lookup_fields->>'medical_benefit_only' = 'Y' AS is_medical_benefit_only,
      lookup_fields->>'questionable_clinical_effectiveness' = 'Y' AS is_qce,
      lookup_fields->>'is_mcap' = 'Y' AS is_mcap,
      lookup_fields->>'is_ids' = 'Y' AS is_ids,
      lookup_fields->>'is_hans' = 'Y' AS is_hans,
      lookup_fields->>'is_pap' = 'Y' AS is_pap
    FROM claim_records
    WHERE file_id = (SELECT file_id FROM params)
  ),
  all_claim_costs AS (
    -- Get total plan cost across all rows
    SELECT 
      SUM(plan_cost) AS total_plan_cost
    FROM base_records
  ),
  prioritized_claims AS (
    -- Extract exclusion categories with priority handling
    SELECT 
      CASE
        WHEN is_otc_drug_ind THEN 'OTC and Injectable Drugs'
        WHEN is_desi THEN 'DESI Drugs'
        WHEN is_fertility THEN 'Fertility'
        WHEN is_growth_hormone THEN 'Growth Hormone'
        WHEN is_abortifacient THEN 'Abortifacients'
        WHEN is_weight_loss_inj THEN 'GLP1 Weightloss'
        WHEN is_lcv_wow THEN 'LCV / Wow Exclusions'
        WHEN is_weight_loss_oral THEN 'Weight Loss (non-GLP1 / All Others)'
        WHEN is_medical_benefit_only THEN 'Medical Benefits Exclusions'
        WHEN is_qce THEN 'Questionable Clinical Effectiveness'
        ELSE NULL
      END AS category,
      plan_cost,
      member_id
    FROM base_records
    WHERE 
      is_otc_drug_ind OR is_desi OR is_fertility OR is_growth_hormone OR
      is_abortifacient OR is_weight_loss_inj OR is_lcv_wow OR 
      is_weight_loss_oral OR is_medical_benefit_only OR is_qce
  ),
  optional_program_claims AS (
    -- Extract optional program claims that don't fall into exclusion categories
    SELECT 
      CASE
        WHEN is_mcap THEN 'MCAP'
        WHEN is_ids THEN 'IDS'
        WHEN is_hans THEN 'HANS'
        WHEN is_pap THEN 'PAP'
        ELSE NULL
      END AS category,
      plan_cost,
      member_id
    FROM base_records
    WHERE 
      NOT (is_otc_drug_ind OR is_desi OR is_fertility OR is_growth_hormone OR
          is_abortifacient OR is_weight_loss_inj OR is_lcv_wow OR 
          is_weight_loss_oral OR is_medical_benefit_only OR is_qce)
      AND (is_mcap OR is_ids OR is_hans OR is_pap)
  ),
  other_claims_awp AS (
    -- Get AWP for rows that don't match any categories
    SELECT 
      SUM(gpi2_awp_per_ds) AS other_awp_sum
    FROM base_records
    WHERE 
      NOT (is_otc_drug_ind OR is_desi OR is_fertility OR is_growth_hormone OR
          is_abortifacient OR is_weight_loss_inj OR is_lcv_wow OR 
          is_weight_loss_oral OR is_medical_benefit_only OR is_qce OR
          is_mcap OR is_ids OR is_hans OR is_pap)
  ),
  category_order AS (
    -- Define the order and type of categories
    SELECT category, sort_order, 'exclusion' AS type FROM (VALUES
      ('OTC and Injectable Drugs', 1),
      ('DESI Drugs', 2),
      ('Fertility', 3),
      ('Growth Hormone', 4),
      ('Abortifacients', 5),
      ('GLP1 Weightloss', 6),
      ('LCV / Wow Exclusions', 7),
      ('Weight Loss (non-GLP1 / All Others)', 8),
      ('Medical Benefits Exclusions', 9),
      ('Questionable Clinical Effectiveness', 10)
    ) AS t(category, sort_order)

    UNION ALL

    SELECT category, sort_order, 'optional' AS type FROM (VALUES
      ('MCAP', 11),
      ('IDS', 12),
      ('HANS', 13),
      ('PAP', 14)
    ) AS t(category, sort_order)
  ), 
  exclusion_results AS (
    -- Aggregate metrics for exclusion categories
    SELECT
      co.category,
      co.type,
      COALESCE(SUM(pc.plan_cost), 0) AS plan_cost_sum,
      COUNT(pc.category) AS claim_count,
      COUNT(DISTINCT pc.member_id) AS unique_member_count
    FROM category_order co
    LEFT JOIN prioritized_claims pc ON co.category = pc.category
    WHERE co.type = 'exclusion'
    ${filterCondition}
    GROUP BY co.category, co.type, co.sort_order
    ORDER BY co.sort_order
  ),
  optional_results AS (
    -- Aggregate metrics for optional program categories
    SELECT
      co.category,
      co.type,
      COALESCE(SUM(op.plan_cost), 0) AS plan_cost_sum,
      COUNT(op.category) AS claim_count,
      COUNT(DISTINCT op.member_id) AS unique_member_count
    FROM category_order co
    LEFT JOIN optional_program_claims op ON co.category = op.category
    WHERE co.type = 'optional'
    GROUP BY co.category, co.type, co.sort_order
    ORDER BY co.sort_order
  )
  -- Return the results as a JSON object with categories and totals
  SELECT json_build_object(
    'exclusion_categories', (
      SELECT json_agg(
        json_build_object(
          'category', category,
          'plan_cost_sum', plan_cost_sum,
          'claim_count', claim_count,
          'unique_member_count', unique_member_count
        )
      )
      FROM exclusion_results
    ),
    'optional_program_categories', (
      SELECT json_agg(
        json_build_object(
          'category', category,
          'plan_cost_sum', plan_cost_sum,
          'claim_count', claim_count,
          'unique_member_count', unique_member_count
        )
      )
      FROM optional_results
    ),
    'total_plan_cost', (SELECT total_plan_cost FROM all_claim_costs),
    'other_awp_sum', (SELECT other_awp_sum FROM other_claims_awp)
  ) AS results;
  `;
    // Execute the query
    const result = await client.query(query, [fileId]);
    // The query returns a single row with a JSON object in the 'results' column
    return result.rows[0]?.results || null;
}
/**
 * Calculate totals across all exclusion categories
 * @param exclusionCategories Array of exclusion category data
 * @returns Object with totals
 */
function calculateTotals(exclusionCategories) {
    return exclusionCategories.reduce((totals, category) => {
        return {
            totalPlanCost: totals.totalPlanCost + (category.plan_cost_sum || 0),
            totalClaimCount: totals.totalClaimCount + (category.claim_count || 0),
            totalMemberCount: totals.totalMemberCount + (category.unique_member_count || 0)
        };
    }, { totalPlanCost: 0, totalClaimCount: 0, totalMemberCount: 0 });
}
//# sourceMappingURL=index.js.map