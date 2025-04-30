// File: lambda/priorAuthProcessor/index.ts

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
  console.log('Starting prior authorization savings analysis with event:', JSON.stringify(event));

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

    // Step 1: Run the prior authorization savings analysis
    const result = await analyzePriorAuthSavings(client, fileId);
    
    // Step 2: Update claim records with prior authorization flags
    await updatePriorAuthClaims(client, fileId);
    
    // Step 3: Save results to savings_results table with category "priorauth"
    await saveResultsToDatabase(client, fileId, 'priorauth', result);

    return {
      statusCode: 200,
      body: {
        message: 'Prior authorization savings analysis completed successfully',
        fileId,
        opportunityId,
        result
      }
    };
  } catch (error) {
    console.error('Error during prior authorization savings analysis:', error);
    return {
      statusCode: 500,
      body: {
        message: 'Prior authorization savings analysis failed',
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
 * Analyze prior authorization savings based on claims data
 */
async function analyzePriorAuthSavings(client: Client, fileId: string) {
  const query = `
  WITH base_claims AS (
  SELECT
    cr.record_id,
    cr.file_id,
    LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') AS ndc11,
    COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) AS days_supply,
    COALESCE((cr.lookup_fields->>'member_copay')::numeric, 0) AS member_copay,
    cr.lookup_fields->>'specialty_indicator' AS specialty_indicator,
    cr.lookup_fields->>'incumbent_rebate_type' AS rebate_type,
    cr.mapped_fields->>'member_id' AS member_id
  FROM edpm.claim_records cr
JOIN edpm.drugs_master dm
  ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
 AND LEFT(cr.lookup_fields->>'brnd_gnrc', 1) = LEFT(dm.brnd_gnrc, 1)
WHERE cr.file_id = $1
  AND cr.lookup_fields->>'is_in_formulary' = 'true'
  AND cr.exclusion_type IS NULL
  AND dm.is_pa = 'Y'
),

claims_with_gpi6 AS (
  SELECT
    bc.*,
    dm.gpi6
  FROM base_claims bc
  JOIN edpm.drugs_master dm ON bc.ndc11 = dm.ndc11
),

filtered_drugs AS (
  SELECT DISTINCT ON (gpi6, LEFT(brnd_gnrc, 1), specialty_indicator)
    gpi6,
    LEFT(brnd_gnrc, 1) AS drug_type,
    specialty_indicator,
    gpi6_awp_per_ds,
    gpi6_avg_disc,
    gpi6_rebate_yield
  FROM edpm.drugs_master
  WHERE LEFT(brnd_gnrc, 1) IN ('B', 'G')
    AND is_pa = 'Y'
  ORDER BY gpi6, LEFT(brnd_gnrc, 1), specialty_indicator
),

drug_data_by_gpi6 AS (
  SELECT
    gpi6,
    specialty_indicator,
    MAX(CASE WHEN drug_type = 'B' THEN gpi6_awp_per_ds END) AS brand_awp_per_ds,
    MAX(CASE WHEN drug_type = 'B' THEN gpi6_avg_disc END) AS brand_avg_disc,
    MAX(CASE WHEN drug_type = 'B' THEN gpi6_rebate_yield END) AS brand_rebate_yield,
    MAX(CASE WHEN drug_type = 'G' THEN gpi6_awp_per_ds END) AS generic_awp_per_ds,
    MAX(CASE WHEN drug_type = 'G' THEN gpi6_avg_disc END) AS generic_avg_disc
  FROM filtered_drugs
  GROUP BY gpi6, specialty_indicator
),

claim_with_costs AS (
  SELECT
    cg.record_id,
    cg.member_id,
    cg.specialty_indicator,
    cg.days_supply,
    cg.member_copay,
    cg.rebate_type,

    -- Brand cost with specialty logic
    GREATEST(
      ((dd.brand_awp_per_ds * (1 - 
        CASE WHEN cg.specialty_indicator = 'N' THEN 0.2044 ELSE dd.brand_avg_disc END
      ) * cg.days_supply) - cg.member_copay)
      - (dd.brand_awp_per_ds * cg.days_supply *
         CASE WHEN cg.rebate_type = 'noRebates' THEN 0 ELSE dd.brand_rebate_yield END),
      0
    ) AS brand_net_cost,

    -- Generic cost with specialty logic
    GREATEST(
      ((dd.generic_awp_per_ds * (1 - 
        CASE WHEN cg.specialty_indicator = 'N' THEN 0.8739 ELSE dd.generic_avg_disc END
      ) * cg.days_supply) - cg.member_copay),
      0
    ) AS generic_net_cost
  FROM claims_with_gpi6 cg
  LEFT JOIN drug_data_by_gpi6 dd
    ON cg.gpi6 = dd.gpi6 AND cg.specialty_indicator = dd.specialty_indicator
)

SELECT json_build_object(
  'Brand Cost', ROUND(SUM(brand_net_cost), 2),
  'Generic Cost', ROUND(SUM(generic_net_cost), 2),
  'Claim Count', COUNT(*),
  'Member Count', COUNT(DISTINCT member_id),
  'Denial Rate', 0.35,
  'Part 1 Potential Savings', ROUND(((SUM(brand_net_cost) + SUM(generic_net_cost)) / 2) * 0.35, 2)
) AS result
FROM claim_with_costs;
  `;

  try {
    const result = await client.query(query, [fileId]);
    return result.rows[0]?.result || null;
  } catch (error) {
    console.error('Error during prior authorization savings analysis:', error);
    throw error;
  }
}

/**
 * Update claim records with prior authorization flags
 */
async function updatePriorAuthClaims(client: Client, fileId: string) {
  const query = `
    WITH eligible_claims AS (
      SELECT cr_inner.record_id
      FROM edpm.claim_records cr_inner
      JOIN edpm.drugs_master dm
        ON LPAD(TRIM(cr_inner.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
       AND LEFT(cr_inner.lookup_fields->>'brnd_gnrc', 1) = LEFT(dm.brnd_gnrc, 1)
      WHERE cr_inner.file_id = $1
        AND cr_inner.lookup_fields->>'is_in_formulary' = 'true'
        AND cr_inner.exclusion_type IS NULL
        AND dm.is_pa = 'Y'
    )
    UPDATE edpm.claim_records cr
    SET exclusion_type = 'D_PA',
        updated_at = CURRENT_TIMESTAMP,
        updated_by = 'lambda-pa-processor'
    FROM eligible_claims ec
    WHERE cr.record_id = ec.record_id;
  `;

  try {
    const result = await client.query(query, [fileId]);
    console.log(`Updated ${result.rowCount} claim records with prior authorization flags`);
    return result.rowCount;
  } catch (error) {
    console.error('Error updating prior authorization claims:', error);
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
    const createdBy = 'lambda-prior-auth-processor';
    
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