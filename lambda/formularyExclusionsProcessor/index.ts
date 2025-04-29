// File: lambda/formularyExclusionsProcessor/index.ts

import { Client } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
  statement_timeout: 300000,      // Increase to 5 minutes
  query_timeout: 300000,          // Increase to 5 minutes
  idle_in_transaction_session_timeout: 300000
};

export const handler = async (event: any) => {
  console.log('Starting formulary exclusions analysis with event:', JSON.stringify(event));

  const { fileId, opportunityId } = event;

  if (!fileId || !opportunityId) {
    throw new Error('Missing required parameters: fileId and opportunityId are required.');
  }

  const client = new Client(dbConfig);

  try {
    await client.connect();
    if (process.env.DB_SCHEMA) {
      await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
    }

    // Step 1: Run the formulary exclusions analysis
    const result = await analyzeFormularyExclusions(client, fileId);
    
    // Step 2: Update claim records with formulary_disruption flag
    await updateFormularyDisruptions(client, fileId);
    
    // Step 3: Save results to savings_results table with category "formulary"
    await saveResultsToDatabase(client, fileId, 'formulary', result);

    return {
      statusCode: 200,
      body: {
        message: 'Formulary exclusions analysis completed successfully',
        fileId,
        opportunityId,
        result
      }
    };
  } catch (error) {
    console.error('Error during formulary exclusions analysis:', error);
    return {
      statusCode: 500,
      body: {
        message: 'Formulary exclusions analysis failed',
        error: error instanceof Error ? error.message : String(error)
      }
    };
  } finally {
    try {
      await client.end();
    } catch (e) {
      console.error('Error closing client:', e);
    }
  }
};

/**
 * Analyze formulary exclusions based on the claims data
 */
async function analyzeFormularyExclusions(client: Client, fileId: string) {
  const query = `
WITH non_formulary_claims AS (
    SELECT 
        cr.record_id, 
        cr.file_id, 
        cr.lookup_fields,
        cr.mapped_fields,
        LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') AS ndc11,
        LEFT(mi.gpi14, 6) AS gpi6,
        LEFT(mi.gpi14, 4) AS gpi4,
        LEFT(mi.gpi14, 2) AS gpi2,
        cr.lookup_fields->>'formulary' AS formulary,
        cr.lookup_fields->>'specialty_indicator' AS claim_specialty_indicator,
        cr.lookup_fields->>'brnd_gnrc' AS claim_brnd_gnrc,
        (cr.lookup_fields->>'days_supply')::numeric AS days_supply,
        (cr.lookup_fields->>'member_copay')::numeric AS member_copay,
        (cr.mapped_fields->>'plan_cost')::numeric AS plan_cost,
        (cr.lookup_fields->>'incumbent_rebate')::numeric AS incumbent_rebate,
        cr.mapped_fields->>'member_id' AS member_id
    FROM claim_records cr
    JOIN mspan_ndc_info mi ON cr.lookup_fields->>'ndc11' = mi.ndc11
    WHERE cr.file_id = $1
      AND cr.lookup_fields->>'is_in_formulary' = 'false' 
      AND cr.exclusion_type IS NULL
),

formulary_gpis AS (
    SELECT DISTINCT 
        LEFT(gpi14, 6) AS gpi6, 
        LEFT(gpi14, 4) AS gpi4, 
        LEFT(gpi14, 2) AS gpi2 
    FROM drugs_master,
         (SELECT DISTINCT formulary FROM non_formulary_claims) f 
    WHERE 
        (f.formulary ILIKE '%Closed%' AND is_closed_formulary = 'Y') 
        OR (f.formulary ILIKE '%Open%' AND is_open_formulary = 'Y')
),

matched_gpi6 AS (
    SELECT 'gpi6' AS gpi_type, gpi6 AS matched_gpi_value, * 
    FROM non_formulary_claims
    WHERE gpi6 IN (SELECT gpi6 FROM formulary_gpis)
),
matched_gpi4 AS (
    SELECT 'gpi4' AS gpi_type, gpi4 AS matched_gpi_value, * 
    FROM non_formulary_claims
    WHERE record_id NOT IN (SELECT record_id FROM matched_gpi6)
      AND gpi4 IN (SELECT gpi4 FROM formulary_gpis)
),
matched_gpi2 AS (
    SELECT 'gpi2' AS gpi_type, gpi2 AS matched_gpi_value, * 
    FROM non_formulary_claims
    WHERE record_id NOT IN (
        SELECT record_id FROM matched_gpi6
        UNION ALL
        SELECT record_id FROM matched_gpi4
    )
      AND gpi2 IN (SELECT gpi2 FROM formulary_gpis)
),
matched_claims AS (
    SELECT * FROM matched_gpi6
    UNION ALL
    SELECT * FROM matched_gpi4
    UNION ALL
    SELECT * FROM matched_gpi2
),

drug_matches AS (
    SELECT 
        mc.record_id,
        mc.member_id,
        mc.gpi_type,
        mc.matched_gpi_value,
        mc.claim_specialty_indicator,
        mc.claim_brnd_gnrc,
        mc.days_supply,
        mc.member_copay,
        mc.plan_cost,
        mc.incumbent_rebate,
        dm.brnd_gnrc AS matched_brnd_gnrc,
        CASE 
            WHEN mc.gpi_type = 'gpi6' THEN dm.gpi6_awp_per_ds
            WHEN mc.gpi_type = 'gpi4' THEN dm.gpi4_awp_per_ds
            WHEN mc.gpi_type = 'gpi2' THEN dm.gpi2_awp_per_ds
        END AS awp_per_ds,
        CASE 
            WHEN mc.gpi_type = 'gpi6' THEN dm.gpi6_avg_disc
            WHEN mc.gpi_type = 'gpi4' THEN dm.gpi4_avg_disc
            WHEN mc.gpi_type = 'gpi2' THEN dm.gpi2_avg_disc
        END AS avg_disc,
        CASE 
            WHEN mc.gpi_type = 'gpi6' THEN dm.gpi6_rebate_yield
            WHEN mc.gpi_type = 'gpi4' THEN dm.gpi4_rebate_yield
            WHEN mc.gpi_type = 'gpi2' THEN dm.gpi2_rebate_yield
        END AS rebate_yield
    FROM matched_claims mc
    JOIN drugs_master dm 
      ON (
        (
            (mc.gpi_type = 'gpi6' AND mc.gpi6 = dm.gpi6)
            OR (mc.gpi_type = 'gpi4' AND mc.gpi4 = dm.gpi4)
            OR (mc.gpi_type = 'gpi2' AND mc.gpi2 = dm.gpi2)
        )
        AND mc.claim_specialty_indicator = dm.specialty_indicator
      )
),

cost_components AS (
    SELECT 
        dm.record_id,
        dm.member_id,
        dm.gpi_type,
        dm.matched_gpi_value,
        dm.claim_specialty_indicator,
        dm.claim_brnd_gnrc,
        dm.days_supply,
        dm.member_copay,
        dm.plan_cost,
        dm.incumbent_rebate,
        dm.matched_brnd_gnrc,
        dm.awp_per_ds,
        CASE 
            WHEN dm.claim_specialty_indicator = 'N' AND dm.matched_brnd_gnrc LIKE 'B%' THEN 0.2044
            WHEN dm.claim_specialty_indicator = 'N' AND dm.matched_brnd_gnrc LIKE 'G%' THEN 0.8739
            WHEN dm.claim_specialty_indicator = 'Y' THEN COALESCE(dm.avg_disc, 0)
            ELSE 0
        END AS used_avg_disc,
        COALESCE(dm.rebate_yield, 0) AS used_rebate_yield
    FROM drug_matches dm
),

pivoted_costs AS (
    SELECT
        record_id,
        member_id,
        claim_specialty_indicator,
        days_supply,
        member_copay,
        plan_cost,
        incumbent_rebate,
        
        MAX(CASE WHEN matched_brnd_gnrc LIKE 'B%' THEN awp_per_ds END) AS brand_awp_per_ds,
        MAX(CASE WHEN matched_brnd_gnrc LIKE 'B%' THEN used_avg_disc END) AS brand_used_discount,
        MAX(CASE WHEN matched_brnd_gnrc LIKE 'B%' THEN used_rebate_yield END) AS brand_rebate_yield,
        
        MAX(CASE WHEN matched_brnd_gnrc LIKE 'G%' THEN awp_per_ds END) AS generic_awp_per_ds,
        MAX(CASE WHEN matched_brnd_gnrc LIKE 'G%' THEN used_avg_disc END) AS generic_used_discount,
        MAX(CASE WHEN matched_brnd_gnrc LIKE 'G%' THEN used_rebate_yield END) AS generic_rebate_yield,
        
        MAX(CASE WHEN matched_brnd_gnrc LIKE 'B%' THEN ((awp_per_ds * (1 - used_avg_disc) * days_supply - member_copay) - (awp_per_ds * days_supply * used_rebate_yield)) END) AS brand_net_cost,
        MAX(CASE WHEN matched_brnd_gnrc LIKE 'G%' THEN ((awp_per_ds * (1 - used_avg_disc) * days_supply - member_copay)) END) AS generic_net_cost
    FROM cost_components
    GROUP BY record_id, member_id, claim_specialty_indicator, days_supply, member_copay, plan_cost, incumbent_rebate
),

claim_final AS (
    SELECT 
        record_id,
        member_id,
        claim_specialty_indicator,
        (plan_cost - incumbent_rebate) AS incumbent_plan_cost,
        ROUND(
            (COALESCE(brand_net_cost, 0) + GREATEST(COALESCE(generic_net_cost, 0), 0)) / 2, 
        2) AS illuminate_plan_cost
    FROM pivoted_costs
),

category_summary AS (
    SELECT
        CASE WHEN claim_specialty_indicator = 'Y' THEN 'Specialty' ELSE 'Non-Specialty' END AS category,
        SUM(incumbent_plan_cost) AS incumbent_plan_cost,
        SUM(illuminate_plan_cost) AS illuminate_plan_cost,
        COUNT(*) AS claim_count,
        COUNT(DISTINCT member_id) AS member_count
    FROM claim_final
    GROUP BY category
),

total_summary AS (
    SELECT
        'Total' AS category,
        SUM(incumbent_plan_cost) AS incumbent_plan_cost,
        SUM(illuminate_plan_cost) AS illuminate_plan_cost,
        SUM(claim_count) AS claim_count,
        SUM(member_count) AS member_count
    FROM category_summary
)

SELECT 
    json_build_object(
        'results', json_agg(
            json_build_object(
                'category', category, 
                'incumbent_plan_cost', TO_CHAR(incumbent_plan_cost, '$FM999,999,999.00'), 
                'illuminate_plan_cost', TO_CHAR(illuminate_plan_cost, '$FM999,999,999.00'), 
                'savings', TO_CHAR(incumbent_plan_cost - illuminate_plan_cost, '$FM999,999,999.00'), 
                'claim_count', claim_count, 
                'member_count', member_count
            ) 
            ORDER BY 
                CASE category 
                    WHEN 'Specialty' THEN 1 
                    WHEN 'Non-Specialty' THEN 2 
                    ELSE 3 
                END
        )
    ) AS results
FROM (
    SELECT * FROM category_summary
    UNION ALL
    SELECT * FROM total_summary
) AS all_summary;
  `;

  try {
    const result = await client.query(query, [fileId]);
    return result.rows[0]?.results || null;
  } catch (error) {
    console.error('Error during formulary exclusions analysis:', error);
    throw error;
  }
}

/**
 * Update claim records with formulary_disruption flag
 */
async function updateFormularyDisruptions(client: Client, fileId: string) {
  const query = `
  WITH matching_records AS (
    SELECT cr.record_id
    FROM edpm.claim_records cr
    WHERE cr.file_id = $1
      AND cr.lookup_fields->>'is_in_formulary' = 'false'
      AND cr.exclusion_type IS NULL
)
UPDATE edpm.claim_records cr
SET exclusion_type = 'formulary_exclusion',
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'lambda-formulary-disruption'
FROM matching_records mr
WHERE cr.record_id = mr.record_id;

  `;

  try {
    const result = await client.query(query, [fileId]);
    console.log(`Updated ${result.rowCount} claim records with formulary_disruption flag`);
    return result.rowCount;
  } catch (error) {
    console.error('Error updating formulary disruptions:', error);
    throw error;
  }
}

/**
 * Save analysis results to the savings_results table
 */
async function saveResultsToDatabase(client: Client, fileId: string, category: string, results: any) {
  try {
    // Generate a new UUID for this result
    const resultId = uuidv4();
    
    // Get user info for created_by field
    const createdBy = 'lambda-formulary-exclusions-processor';
    
    // First, delete any existing records for this file and category
    try {
      await client.query(`
        DELETE FROM savings_results 
        WHERE file_id = $1 AND category = $2
      `, [fileId, category]);
    } catch (deleteError) {
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
  } catch (error) {
    console.error('Error saving results to database:', error);
    throw error;
  }
}