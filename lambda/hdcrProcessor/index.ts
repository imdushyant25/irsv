// File: lambda/hdcrProcessor/index.ts

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
  statement_timeout: 300000,      // 5 minutes
  query_timeout: 300000,          // 5 minutes
  idle_in_transaction_session_timeout: 300000
};

export const handler = async (event: any) => {
  console.log('Starting HDCR savings analysis with event:', JSON.stringify(event));

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

    // Step 1: Run the HDCR savings analysis
    const result = await analyzeHdcrSavings(client, fileId);
    
    // Step 2: Update claim records with HDCR flags
    await updateHdcrClaims(client, fileId);
    
    // Step 3: Save results to savings_results table with category "hdcr"
    await saveResultsToDatabase(client, fileId, 'hdcr', result);

    return {
      statusCode: 200,
      body: {
        message: 'HDCR savings analysis completed successfully',
        fileId,
        opportunityId,
        result
      }
    };
  } catch (error) {
    console.error('Error during HDCR savings analysis:', error);
    return {
      statusCode: 500,
      body: {
        message: 'HDCR savings analysis failed',
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
 * Analyze high dollar claim review (HDCR) savings based on claim costs
 */
async function analyzeHdcrSavings(client: Client, fileId: string) {
  const query = `
  WITH base_claims AS (
  SELECT
    cr.record_id,
    cr.file_id,
    LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') AS ndc11,
    COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) AS days_supply,
    COALESCE((cr.lookup_fields->>'member_copay')::numeric, 0) AS member_copay,
    COALESCE((cr.lookup_fields->>'reprice_gross_cost')::numeric, 0) AS plan_cost,
    cr.lookup_fields->>'incumbent_rebate_type' AS rebate_type,
    cr.mapped_fields->>'member_id' AS member_id
  FROM edpm.claim_records cr
  WHERE cr.file_id = $1
    AND cr.lookup_fields->>'is_in_formulary' = 'true'
    AND cr.exclusion_type IS NULL
    AND cr.lookup_fields->>'specialty_indicator' = 'N'
    AND (
      (COALESCE((cr.lookup_fields->>'reprice_gross_cost')::numeric, 0) >= 1000 AND COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) <= 30)
      OR (COALESCE((cr.lookup_fields->>'reprice_gross_cost')::numeric, 0) >= 2000 AND COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) BETWEEN 31 AND 60)
      OR (COALESCE((cr.lookup_fields->>'reprice_gross_cost')::numeric, 0) >= 3000 AND COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) > 60)
    )
),

claims_with_gpi6 AS (
  SELECT
    bc.*,
    dm.gpi6
  FROM base_claims bc
  JOIN edpm.drugs_master dm ON bc.ndc11 = dm.ndc11
),

-- Step 1: one brand and one generic per gpi6
filtered_drugs AS (
  SELECT DISTINCT ON (gpi6, LEFT(brnd_gnrc, 1))
    gpi6,
    LEFT(brnd_gnrc, 1) AS drug_type,
    gpi6_awp_per_ds,
    gpi6_rebate_yield
  FROM edpm.drugs_master
  WHERE LEFT(brnd_gnrc, 1) IN ('B', 'G')
  ORDER BY gpi6, LEFT(brnd_gnrc, 1)
),

-- Step 2: pivot to one row per gpi6
drug_data_by_gpi6 AS (
  SELECT
    gpi6,
    MAX(CASE WHEN drug_type = 'B' THEN gpi6_awp_per_ds END) AS brand_awp_per_ds,
    MAX(CASE WHEN drug_type = 'B' THEN gpi6_rebate_yield END) AS brand_rebate_yield,
    MAX(CASE WHEN drug_type = 'G' THEN gpi6_awp_per_ds END) AS generic_awp_per_ds
  FROM filtered_drugs
  GROUP BY gpi6
),

claim_with_costs AS (
  SELECT
    cg.record_id,
    cg.member_id,
    cg.gpi6,
    cg.days_supply,
    cg.member_copay,
    cg.rebate_type,

    -- Brand net cost
    GREATEST(
      ((dd.brand_awp_per_ds * (1 - 0.2044) * cg.days_supply) - cg.member_copay)
      - (dd.brand_awp_per_ds * cg.days_supply *
         CASE WHEN cg.rebate_type = 'noRebates' THEN 0 ELSE dd.brand_rebate_yield END),
      0
    ) AS brand_net_cost,

    -- Generic net cost
    GREATEST(
      ((dd.generic_awp_per_ds * (1 - 0.8739) * cg.days_supply) - cg.member_copay),
      0
    ) AS generic_net_cost
  FROM claims_with_gpi6 cg
  LEFT JOIN drug_data_by_gpi6 dd ON cg.gpi6 = dd.gpi6
),

totals AS (
  SELECT
    SUM(brand_net_cost) AS brand_cost,
    SUM(generic_net_cost) AS generic_cost,
    COUNT(*) AS claim_count,
    COUNT(DISTINCT member_id) AS member_count
  FROM claim_with_costs
)

SELECT json_build_object(
  'Brand Cost', ROUND(brand_cost, 2),
  'Generic Cost', ROUND(generic_cost, 2),
  'Claim Count', claim_count,
  'Member Count', member_count,
  'Denial Rate', 0.35,
  'Part 1 Potential Savings', ROUND(((brand_cost + generic_cost) / 2) * 0.35, 2)
) AS result
FROM totals;
  `;

  try {
    const result = await client.query(query, [fileId]);
    return result.rows[0]?.result || null;
  } catch (error) {
    console.error('Error during HDCR savings analysis:', error);
    throw error;
  }
}

/**
 * Update claim records with HDCR flags
 */
async function updateHdcrClaims(client: Client, fileId: string) {
  try {
    // Step 1: Select record IDs eligible for HDCR update
    const selectQuery = `
      SELECT cr.record_id
      FROM edpm.claim_records cr
      JOIN edpm.drugs_master dm
        ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
       AND LEFT(cr.lookup_fields->>'brnd_gnrc', 1) = LEFT(dm.brnd_gnrc, 1)
      WHERE cr.file_id = $1
        AND cr.lookup_fields->>'is_in_formulary' = 'true'
        AND cr.lookup_fields->>'specialty_indicator' = 'N'
        AND cr.exclusion_type IS NULL
        AND (
          (COALESCE((cr.lookup_fields->>'reprice_gross_cost')::numeric, 0) >= 1000 AND COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) <= 30)
          OR (COALESCE((cr.lookup_fields->>'reprice_gross_cost')::numeric, 0) >= 2000 AND COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) BETWEEN 31 AND 60)
          OR (COALESCE((cr.lookup_fields->>'reprice_gross_cost')::numeric, 0) >= 3000 AND COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) > 60)
        )
    `;

    const { rows } = await client.query(selectQuery, [fileId]);
    const recordIds = rows.map((r: any) => r.record_id);

    if (recordIds.length === 0) {
      console.log('No claims to update for HDCR.');
      return 0;
    }

    console.log(`Found ${recordIds.length} claim records to update for HDCR.`);

    // Step 2: Update records using WHERE record_id = ANY(array)
    const updateQuery = `
      UPDATE edpm.claim_records
      SET exclusion_type = 'C_HDCR',
          updated_at = CURRENT_TIMESTAMP,
          updated_by = 'lambda-hdcr-processor'
      WHERE record_id = ANY($1)
    `;

    const updateResult = await client.query(updateQuery, [recordIds]);
    console.log(`Updated ${updateResult.rowCount} claim records with C_HDCR exclusion_type.`);
    return updateResult.rowCount;

  } catch (error) {
    console.error('Error updating HDCR claims:', error);
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
    const createdBy = 'lambda-hdcr-processor';
    
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