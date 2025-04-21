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
  WITH base_formulary AS (
  SELECT (lookup_fields->>'formulary') AS formulary
  FROM edpm.claim_records
  WHERE file_id = $1
  LIMIT 1
),

claims_with_gpi AS (
  SELECT 
    cr.record_id,
    cr.lookup_fields,
    cr.mapped_fields,
    mi.gpi14,
    LEFT(mi.gpi14, 6) AS gpi6,
    LEFT(mi.gpi14, 4) AS gpi4,
    LEFT(mi.gpi14, 2) AS gpi2
  FROM edpm.claim_records cr
  JOIN edpm.mspan_ndc_info mi ON cr.lookup_fields->>'ndc11' = mi.ndc11
  WHERE cr.file_id = $1
    AND cr.lookup_fields->>'is_in_formulary' = 'false'
    AND NOT (cr.lookup_fields ? 'Exclusion Type')
),

distinct_excluded_gpis AS (
  SELECT gpi6 AS gpi_value, 'gpi6' AS gpi_type FROM claims_with_gpi
  UNION
  SELECT gpi4 AS gpi_value, 'gpi4' AS gpi_type FROM claims_with_gpi
  UNION
  SELECT gpi2 AS gpi_value, 'gpi2' AS gpi_type FROM claims_with_gpi
),

existing_gpis AS (
  SELECT DISTINCT d.gpi_value, d.gpi_type
  FROM distinct_excluded_gpis d, base_formulary bf
  WHERE EXISTS (
    SELECT 1
    FROM edpm.drugs_master dm
    WHERE (
      (d.gpi_type = 'gpi6' AND dm.gpi6 = d.gpi_value AND dm.gpi6_awp_per_ds > 0 AND
       ((bf.formulary ILIKE '%Closed%' AND dm.is_closed_formulary = 'Y') OR
        (bf.formulary ILIKE '%Open%' AND dm.is_open_formulary = 'Y')))
    ) OR (
      (d.gpi_type = 'gpi4' AND dm.gpi4 = d.gpi_value AND dm.gpi4_awp_per_ds > 0 AND
       ((bf.formulary ILIKE '%Closed%' AND dm.is_closed_formulary = 'Y') OR
        (bf.formulary ILIKE '%Open%' AND dm.is_open_formulary = 'Y')))
    ) OR (
      (d.gpi_type = 'gpi2' AND dm.gpi2 = d.gpi_value AND dm.gpi2_awp_per_ds > 0 AND
       ((bf.formulary ILIKE '%Closed%' AND dm.is_closed_formulary = 'Y') OR
        (bf.formulary ILIKE '%Open%' AND dm.is_open_formulary = 'Y')))
    )
  )
),

kept_gpi6 AS (
  SELECT gpi_value FROM existing_gpis WHERE gpi_type = 'gpi6'
),
kept_gpi4 AS (
  SELECT gpi_value
  FROM existing_gpis
  WHERE gpi_type = 'gpi4'
    AND NOT EXISTS (
      SELECT 1 FROM kept_gpi6 WHERE gpi_value LIKE kept_gpi6.gpi_value || '%'
    )
),
kept_gpi2 AS (
  SELECT gpi_value
  FROM existing_gpis
  WHERE gpi_type = 'gpi2'
    AND NOT EXISTS (
      SELECT 1 FROM kept_gpi6 WHERE gpi_value LIKE kept_gpi6.gpi_value || '%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM kept_gpi4 WHERE gpi_value LIKE kept_gpi4.gpi_value || '%'
    )
),
final_gpis AS (
  SELECT gpi_value, 'gpi6' AS gpi_type FROM kept_gpi6
  UNION
  SELECT gpi_value, 'gpi4' AS gpi_type FROM kept_gpi4
  UNION
  SELECT gpi_value, 'gpi2' AS gpi_type FROM kept_gpi2
),

matched_claims AS (
  SELECT 
    c.record_id,
    c.lookup_fields,
    c.mapped_fields,
    f.gpi_type,
    f.gpi_value,
    c.lookup_fields->>'specialty_indicator' AS specialty_indicator,
    c.lookup_fields->>'brnd_gnrc' AS brnd_gnrc
  FROM claims_with_gpi c
  JOIN final_gpis f
    ON (f.gpi_type = 'gpi6' AND f.gpi_value = c.gpi6)
    OR (f.gpi_type = 'gpi4' AND f.gpi_value = c.gpi4)
    OR (f.gpi_type = 'gpi2' AND f.gpi_value = c.gpi2)
),

claim_costs AS (
  SELECT 
    mc.*,
    CASE
      WHEN mc.gpi_type = 'gpi6' THEN dm.gpi6_awp_per_ds
      WHEN mc.gpi_type = 'gpi4' THEN dm.gpi4_awp_per_ds
      WHEN mc.gpi_type = 'gpi2' THEN dm.gpi2_awp_per_ds
    END AS awp_per_ds,
    CASE
      WHEN mc.gpi_type = 'gpi6' AND mc.specialty_indicator = 'N' AND mc.brnd_gnrc LIKE 'B%' THEN 0.2044
      WHEN mc.gpi_type = 'gpi6' AND mc.specialty_indicator = 'N' AND mc.brnd_gnrc LIKE 'G%' THEN 0.8739
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
  JOIN edpm.drugs_master dm
    ON (
      (
        (mc.gpi_type = 'gpi6' AND dm.gpi6 = mc.gpi_value) OR
        (mc.gpi_type = 'gpi4' AND dm.gpi4 = mc.gpi_value) OR
        (mc.gpi_type = 'gpi2' AND dm.gpi2 = mc.gpi_value)
      )
      AND dm.specialty_indicator = mc.specialty_indicator
      AND LEFT(dm.brnd_gnrc, 1) = LEFT(mc.brnd_gnrc, 1)
    )
),

costs AS (
  SELECT *,
    CASE
  WHEN lookup_fields->>'incumbent_rebate_type' = 'noRebates' THEN 0
  ELSE rebate_yield
END,
    CASE
      WHEN lookup_fields->>'incumbent_rebate_type' != 'noRebates' THEN
        (
          COALESCE((mapped_fields->>'plan_cost')::numeric, 0) -
          COALESCE((lookup_fields->>'incumbent_rebate')::numeric, 0)
        )
      ELSE COALESCE((mapped_fields->>'plan_cost')::numeric, 0)
    END AS adjusted_plan_cost,
    CASE
      WHEN specialty_indicator = 'Y' AND brnd_gnrc LIKE 'B%' THEN
        ((awp_per_ds * (1 - avg_disc) * COALESCE((lookup_fields->>'days_supply')::numeric, 0)
          - COALESCE((lookup_fields->>'member_copay')::numeric, 0))
         - (awp_per_ds * COALESCE((lookup_fields->>'days_supply')::numeric, 0) * CASE
     WHEN lookup_fields->>'incumbent_rebate_type' = 'noRebates' THEN 0
     ELSE rebate_yield
   END))
      WHEN specialty_indicator = 'Y' AND brnd_gnrc LIKE 'G%' THEN
        ((awp_per_ds * (1 - avg_disc) * COALESCE((lookup_fields->>'days_supply')::numeric, 0))
         - COALESCE((lookup_fields->>'member_copay')::numeric, 0))
      WHEN specialty_indicator <> 'Y' AND brnd_gnrc LIKE 'B%' THEN
        ((awp_per_ds * (1 - avg_disc) * COALESCE((lookup_fields->>'days_supply')::numeric, 0)
          - COALESCE((lookup_fields->>'member_copay')::numeric, 0))
         - (awp_per_ds * COALESCE((lookup_fields->>'days_supply')::numeric, 0) * CASE
     WHEN lookup_fields->>'incumbent_rebate_type' = 'noRebates' THEN 0
     ELSE rebate_yield
   END))
      WHEN specialty_indicator <> 'Y' AND brnd_gnrc LIKE 'G%' THEN
        ((awp_per_ds * (1 - avg_disc) * COALESCE((lookup_fields->>'days_supply')::numeric, 0))
         - COALESCE((lookup_fields->>'member_copay')::numeric, 0))
    END AS net_cost
  FROM claim_costs
),

final_costs AS (
  SELECT DISTINCT ON (record_id) *
  FROM costs
  ORDER BY record_id,
    CASE gpi_type
      WHEN 'gpi6' THEN 1
      WHEN 'gpi4' THEN 2
      WHEN 'gpi2' THEN 3
      ELSE 4
    END
),

category_base AS (
  SELECT * FROM (VALUES ('Specialty'), ('Non-Specialty')) AS cb(category)
),

category_summary AS (
  SELECT
    CASE 
      WHEN specialty_indicator = 'Y' THEN 'Specialty'
      ELSE 'Non-Specialty'
    END AS category,
    SUM(adjusted_plan_cost) AS adjusted_plan_cost,
    SUM(net_cost) AS net_cost,
    COUNT(*) AS claim_count,
    COUNT(DISTINCT mapped_fields->>'member_id') AS member_count
  FROM final_costs
  GROUP BY 1
),

summary_data AS (
  SELECT 
    cb.category,
    TO_CHAR(COALESCE(cs.adjusted_plan_cost, 0), '$FM999,999,999.00') AS incumbent_plan_cost,
    TO_CHAR(COALESCE(cs.net_cost, 0), '$FM999,999,999.00') AS illuminate_plan_cost,
    TO_CHAR(COALESCE(cs.adjusted_plan_cost, 0) - COALESCE(cs.net_cost, 0), '$FM999,999,999.00') AS savings,
    COALESCE(cs.claim_count, 0) AS claim_count,
    COALESCE(cs.member_count, 0) AS member_count,
    CASE cb.category WHEN 'Specialty' THEN 1 WHEN 'Non-Specialty' THEN 2 END AS sort_order
  FROM category_base cb
  LEFT JOIN category_summary cs ON cs.category = cb.category

  UNION ALL

  SELECT 
    'Total',
    TO_CHAR(SUM(adjusted_plan_cost), '$FM999,999,999.00'),
    TO_CHAR(SUM(net_cost), '$FM999,999,999.00'),
    TO_CHAR(SUM(adjusted_plan_cost) - SUM(net_cost), '$FM999,999,999.00'),
    COUNT(*),
    COUNT(DISTINCT mapped_fields->>'member_id'),
    3
  FROM final_costs
)

SELECT json_build_object(
  'results', json_agg(
    json_build_object(
      'category', category,
      'incumbent_plan_cost', incumbent_plan_cost,
      'illuminate_plan_cost', illuminate_plan_cost,
      'savings', savings,
      'claim_count', claim_count,
      'member_count', member_count
    )
    ORDER BY sort_order
  )
) AS results
FROM summary_data;
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
    WITH base_formulary AS (
  SELECT file_id, (lookup_fields->>'formulary') AS formulary
  FROM edpm.claim_records
  WHERE file_id = $1
  LIMIT 1
),

claims_with_gpi AS (
  SELECT 
    cr.record_id,
    cr.lookup_fields,
    LEFT(mi.gpi14, 6) AS gpi6,
    LEFT(mi.gpi14, 4) AS gpi4,
    LEFT(mi.gpi14, 2) AS gpi2
  FROM edpm.claim_records cr
  JOIN edpm.mspan_ndc_info mi ON cr.lookup_fields->>'ndc11' = mi.ndc11
  JOIN base_formulary bf ON cr.file_id = bf.file_id
  WHERE cr.file_id = $1
    AND cr.lookup_fields->>'is_in_formulary' = 'false'
    AND NOT (cr.lookup_fields ? 'Exclusion Type')
),

distinct_gpis AS (
  SELECT gpi6 AS gpi_value, 'gpi6' AS gpi_type FROM claims_with_gpi
  UNION
  SELECT gpi4 AS gpi_value, 'gpi4' AS gpi_type FROM claims_with_gpi
  UNION
  SELECT gpi2 AS gpi_value, 'gpi2' AS gpi_type FROM claims_with_gpi
),

existing_gpis AS (
  SELECT DISTINCT d.gpi_value, d.gpi_type
  FROM distinct_gpis d, base_formulary bf
  WHERE EXISTS (
    SELECT 1
    FROM edpm.drugs_master dm
    WHERE (
      (d.gpi_type = 'gpi6' AND dm.gpi6 = d.gpi_value AND dm.gpi6_awp_per_ds > 0 AND
        ((bf.formulary ILIKE '%Closed%' AND dm.is_closed_formulary = 'Y') OR
         (bf.formulary ILIKE '%Open%' AND dm.is_open_formulary = 'Y')))
      OR
      (d.gpi_type = 'gpi4' AND dm.gpi4 = d.gpi_value AND dm.gpi4_awp_per_ds > 0 AND
        ((bf.formulary ILIKE '%Closed%' AND dm.is_closed_formulary = 'Y') OR
         (bf.formulary ILIKE '%Open%' AND dm.is_open_formulary = 'Y')))
      OR
      (d.gpi_type = 'gpi2' AND dm.gpi2 = d.gpi_value AND dm.gpi2_awp_per_ds > 0 AND
        ((bf.formulary ILIKE '%Closed%' AND dm.is_closed_formulary = 'Y') OR
         (bf.formulary ILIKE '%Open%' AND dm.is_open_formulary = 'Y')))
    )
  )
),

-- deduplicate: gpi6 > gpi4 > gpi2
kept_gpi6 AS (
  SELECT gpi_value FROM existing_gpis WHERE gpi_type = 'gpi6'
),
kept_gpi4 AS (
  SELECT gpi_value
  FROM existing_gpis
  WHERE gpi_type = 'gpi4'
    AND NOT EXISTS (
      SELECT 1 FROM kept_gpi6 WHERE gpi_value LIKE kept_gpi6.gpi_value || '%'
    )
),
kept_gpi2 AS (
  SELECT gpi_value
  FROM existing_gpis
  WHERE gpi_type = 'gpi2'
    AND NOT EXISTS (
      SELECT 1 FROM kept_gpi6 WHERE gpi_value LIKE kept_gpi6.gpi_value || '%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM kept_gpi4 WHERE gpi_value LIKE kept_gpi4.gpi_value || '%'
    )
),
final_gpis AS (
  SELECT gpi_value, 'gpi6' AS gpi_type FROM kept_gpi6
  UNION
  SELECT gpi_value, 'gpi4' AS gpi_type FROM kept_gpi4
  UNION
  SELECT gpi_value, 'gpi2' AS gpi_type FROM kept_gpi2
),

-- Claims that matched final GPI
matched_claims AS (
  SELECT DISTINCT c.record_id
  FROM claims_with_gpi c
  JOIN final_gpis f
    ON (f.gpi_type = 'gpi6' AND f.gpi_value = c.gpi6)
    OR (f.gpi_type = 'gpi4' AND f.gpi_value = c.gpi4)
    OR (f.gpi_type = 'gpi2' AND f.gpi_value = c.gpi2)
),

-- Claims with no GPI match = disruption required
disruptions AS (
  SELECT c.record_id
  FROM claims_with_gpi c
  LEFT JOIN matched_claims m ON c.record_id = m.record_id
  WHERE m.record_id IS NULL
)

UPDATE edpm.claim_records cr
SET lookup_fields = jsonb_set(cr.lookup_fields, '{formulary_disruption}', '"Y"', true),
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'lambda-disruption'
FROM disruptions d
WHERE cr.record_id = d.record_id;
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