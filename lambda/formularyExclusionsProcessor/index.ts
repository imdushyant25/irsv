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
  -- Identify non-formulary claims
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
        mi.gpi14, 
        cr.lookup_fields->>'formulary' AS formulary 
    FROM 
        claim_records cr 
    JOIN 
        mspan_ndc_info mi ON cr.lookup_fields->>'ndc11' = mi.ndc11 
    WHERE 
        cr.file_id = $1 
        AND cr.lookup_fields->>'is_in_formulary' = 'false' 
        AND NOT (cr.lookup_fields ? 'Exclusion Type')
),

-- Extract GPI values for formulary drugs
formulary_gpis AS (
    SELECT DISTINCT 
        LEFT(gpi14, 6) AS gpi6, 
        LEFT(gpi14, 4) AS gpi4, 
        LEFT(gpi14, 2) AS gpi2 
    FROM 
        drugs_master, 
        (SELECT DISTINCT formulary FROM non_formulary_claims) f 
    WHERE 
        (f.formulary ILIKE '%Closed%' AND is_closed_formulary = 'Y') 
        OR (f.formulary ILIKE '%Open%' AND is_open_formulary = 'Y')
),

-- Match claims by GPI levels
matched_gpi6 AS (
    SELECT 
        'gpi6' AS gpi_type, 
        * 
    FROM 
        non_formulary_claims 
    WHERE 
        gpi6 IN (SELECT gpi6 FROM formulary_gpis)
),

matched_gpi4 AS (
    SELECT 
        'gpi4' AS gpi_type, 
        * 
    FROM 
        non_formulary_claims 
    WHERE 
        record_id NOT IN (SELECT record_id FROM matched_gpi6) 
        AND gpi4 IN (SELECT gpi4 FROM formulary_gpis)
),

matched_gpi2 AS (
    SELECT 
        'gpi2' AS gpi_type, 
        * 
    FROM 
        non_formulary_claims 
    WHERE 
        record_id NOT IN (
            SELECT record_id FROM matched_gpi6 
            UNION 
            SELECT record_id FROM matched_gpi4
        ) 
        AND gpi2 IN (SELECT gpi2 FROM formulary_gpis)
),

-- Combine all matched claims
all_matched_claims AS (
    SELECT * FROM matched_gpi6 
    UNION ALL 
    SELECT * FROM matched_gpi4 
    UNION ALL 
    SELECT * FROM matched_gpi2
),

-- Rank drugs by various criteria
ranked_drugs AS (
    SELECT 
        *, 
        LEFT(brnd_gnrc, 1) AS brand_flag, 
        ROW_NUMBER() OVER (
            PARTITION BY gpi6, specialty_indicator, LEFT(brnd_gnrc, 1) 
            ORDER BY gpi6_awp_per_ds DESC NULLS LAST
        ) AS rk_gpi6, 
        ROW_NUMBER() OVER (
            PARTITION BY gpi4, specialty_indicator, LEFT(brnd_gnrc, 1) 
            ORDER BY gpi4_awp_per_ds DESC NULLS LAST
        ) AS rk_gpi4, 
        ROW_NUMBER() OVER (
            PARTITION BY gpi2, specialty_indicator, LEFT(brnd_gnrc, 1) 
            ORDER BY gpi2_awp_per_ds DESC NULLS LAST
        ) AS rk_gpi2 
    FROM 
        drugs_master
),

-- Calculate costs for claims
claim_costs AS (
    SELECT 
        amc.record_id, 
        amc.gpi_type, 
        amc.lookup_fields, 
        amc.mapped_fields, 
        COALESCE((amc.lookup_fields->>'days_supply')::numeric, 0) AS days_supply, 
        COALESCE((amc.lookup_fields->>'member_copay')::numeric, 0) AS member_copay, 
        COALESCE((amc.lookup_fields->>'incumbent_rebate')::numeric, 0) AS incumbent_rebate, 
        amc.lookup_fields->>'incumbent_rebate_type' AS incumbent_rebate_type, 
        amc.lookup_fields->>'specialty_indicator' AS specialty_indicator, 
        amc.lookup_fields->>'brnd_gnrc' AS brnd_gnrc, 
        (amc.mapped_fields->>'plan_cost')::numeric AS plan_cost, 
        (amc.mapped_fields->>'member_id') AS member_id,
        dm.gpi6_awp_per_ds, 
        dm.gpi4_awp_per_ds, 
        dm.gpi2_awp_per_ds, 
        dm.gpi6_avg_disc, 
        dm.gpi4_avg_disc, 
        dm.gpi2_avg_disc, 
        dm.gpi6_rebate_yield, 
        dm.gpi4_rebate_yield, 
        dm.gpi2_rebate_yield
    FROM 
        all_matched_claims amc 
    LEFT JOIN 
        ranked_drugs dm ON (
            (amc.gpi_type = 'gpi6' AND amc.gpi6 = dm.gpi6 AND dm.rk_gpi6 = 1 
             AND dm.specialty_indicator = amc.lookup_fields->>'specialty_indicator' 
             AND LEFT(amc.lookup_fields->>'brnd_gnrc', 1) = dm.brand_flag)
            OR 
            (amc.gpi_type = 'gpi4' AND amc.gpi4 = dm.gpi4 AND dm.rk_gpi4 = 1 
             AND dm.specialty_indicator = amc.lookup_fields->>'specialty_indicator' 
             AND LEFT(amc.lookup_fields->>'brnd_gnrc', 1) = dm.brand_flag)
            OR 
            (amc.gpi_type = 'gpi2' AND amc.gpi2 = dm.gpi2 AND dm.rk_gpi2 = 1 
             AND dm.specialty_indicator = amc.lookup_fields->>'specialty_indicator' 
             AND LEFT(amc.lookup_fields->>'brnd_gnrc', 1) = dm.brand_flag)
        )
),

-- Calculate cost components
cost_components AS (
    SELECT 
        *, 
        CASE gpi_type 
            WHEN 'gpi6' THEN gpi6_awp_per_ds 
            WHEN 'gpi4' THEN gpi4_awp_per_ds 
            WHEN 'gpi2' THEN gpi2_awp_per_ds 
        END AS awp_per_ds,
        CASE 
            WHEN specialty_indicator = 'N' AND brnd_gnrc LIKE 'B%' THEN 0.2044 
            WHEN specialty_indicator = 'N' AND brnd_gnrc LIKE 'G%' THEN 0.8739 
            WHEN gpi_type = 'gpi6' THEN gpi6_avg_disc 
            WHEN gpi_type = 'gpi4' THEN gpi4_avg_disc 
            WHEN gpi_type = 'gpi2' THEN gpi2_avg_disc 
            ELSE 0 
        END AS avg_disc,
        CASE 
            WHEN incumbent_rebate_type = 'noRebates' THEN 0 
            WHEN gpi_type = 'gpi6' THEN gpi6_rebate_yield 
            WHEN gpi_type = 'gpi4' THEN gpi4_rebate_yield 
            WHEN gpi_type = 'gpi2' THEN gpi2_rebate_yield 
            ELSE 0 
        END AS rebate_adj,
        CASE 
            WHEN incumbent_rebate_type != 'noRebates' THEN plan_cost - incumbent_rebate 
            ELSE plan_cost 
        END AS adjusted_plan_cost 
    FROM 
        claim_costs
),

-- Calculate final net costs
final_costs AS (
    SELECT 
        *, 
        CASE 
            WHEN specialty_indicator = 'Y' AND brnd_gnrc LIKE 'B%' THEN 
                ((awp_per_ds * (1 - avg_disc) * days_supply - member_copay) - (awp_per_ds * days_supply * rebate_adj)) 
            WHEN specialty_indicator = 'Y' AND brnd_gnrc LIKE 'G%' THEN 
                ((awp_per_ds * (1 - avg_disc) * days_supply) - member_copay) 
            WHEN specialty_indicator <> 'Y' AND brnd_gnrc LIKE 'B%' THEN 
                ((awp_per_ds * (1 - avg_disc) * days_supply - member_copay) - (awp_per_ds * days_supply * rebate_adj)) 
            WHEN specialty_indicator <> 'Y' AND brnd_gnrc LIKE 'G%' THEN 
                ((awp_per_ds * (1 - avg_disc) * days_supply) - member_copay) 
            ELSE NULL 
        END AS net_cost 
    FROM 
        cost_components
),

-- Summarize by category
category_summary AS (
    SELECT 
        CASE 
            WHEN specialty_indicator = 'Y' THEN 'Specialty' 
            ELSE 'Non-Specialty' 
        END AS category, 
        SUM(adjusted_plan_cost) AS adjusted_plan_cost, 
        SUM(net_cost) AS net_cost, 
        COUNT(*) AS claim_count, 
        COUNT(DISTINCT member_id) AS member_count 
    FROM 
        final_costs 
    GROUP BY 1
),

-- Calculate totals
total_row AS (
    SELECT 
        'Total' AS category, 
        SUM(adjusted_plan_cost) AS adjusted_plan_cost, 
        SUM(net_cost) AS net_cost, 
        COUNT(*) AS claim_count, 
        COUNT(DISTINCT member_id) AS member_count 
    FROM 
        final_costs
),

-- Combine category and total summaries
all_summary AS (
    SELECT * FROM category_summary 
    UNION ALL 
    SELECT * FROM total_row
)

-- Generate final JSON output
SELECT 
    json_build_object(
        'results', json_agg(
            json_build_object(
                'category', category, 
                'incumbent_plan_cost', TO_CHAR(adjusted_plan_cost, '$FM999,999,999.00'), 
                'illuminate_plan_cost', TO_CHAR(net_cost, '$FM999,999,999.00'), 
                'savings', TO_CHAR(adjusted_plan_cost - net_cost, '$FM999,999,999.00'), 
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
FROM 
    all_summary;
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
    WITH non_formulary_claims AS (
  SELECT
    cr.record_id,
    LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') AS ndc11,
    LEFT(mi.gpi14, 6) AS gpi6,
    LEFT(mi.gpi14, 4) AS gpi4,
    LEFT(mi.gpi14, 2) AS gpi2,
    mi.gpi14,
    cr.lookup_fields->>'formulary' AS formulary
  FROM claim_records cr
  JOIN mspan_ndc_info mi ON cr.lookup_fields->>'ndc11' = mi.ndc11
  WHERE cr.file_id = $1
    AND cr.lookup_fields->>'is_in_formulary' = 'false'
    AND NOT (cr.lookup_fields ? 'Exclusion Type')
),
formulary_gpis AS (
  SELECT DISTINCT
    LEFT(gpi14, 6) AS gpi6,
    LEFT(gpi14, 4) AS gpi4,
    LEFT(gpi14, 2) AS gpi2
  FROM drugs_master, (SELECT DISTINCT formulary FROM non_formulary_claims) f
  WHERE (
    (f.formulary ILIKE '%Closed%' AND is_closed_formulary = 'Y') OR
    (f.formulary ILIKE '%Open%' AND is_open_formulary = 'Y')
  )
),
matched_gpi6 AS (
  SELECT record_id
  FROM non_formulary_claims
  WHERE gpi6 IN (SELECT gpi6 FROM formulary_gpis)
),
matched_gpi4 AS (
  SELECT record_id
  FROM non_formulary_claims
  WHERE record_id NOT IN (SELECT record_id FROM matched_gpi6)
    AND gpi4 IN (SELECT gpi4 FROM formulary_gpis)
),
matched_gpi2 AS (
  SELECT record_id
  FROM non_formulary_claims
  WHERE record_id NOT IN (
    SELECT record_id FROM matched_gpi6
    UNION
    SELECT record_id FROM matched_gpi4
  )
    AND gpi2 IN (SELECT gpi2 FROM formulary_gpis)
),
all_matched_ids AS (
  SELECT record_id FROM matched_gpi6
  UNION
  SELECT record_id FROM matched_gpi4
  UNION
  SELECT record_id FROM matched_gpi2
)
UPDATE claim_records cr
SET lookup_fields = jsonb_set(cr.lookup_fields, '{formulary_disruption}', '\"Y\"', true)
FROM all_matched_ids m
WHERE cr.record_id = m.record_id;
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