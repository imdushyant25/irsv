// File: lambda/diabetesProcessor/index.ts

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
  console.log('Starting diabetes savings analysis with event:', JSON.stringify(event));

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

    // Step 1: Run the diabetes savings analysis
    console.log('Starting weight loss savings analysis...');
    const analysisStart = Date.now();
    const result = await analyzeDiabetesSavings(client, fileId);
    console.log(`Finished weight loss savings analysis in ${Date.now() - analysisStart} ms`);
    
    // Step 2: Update claim records with diabetes flags
    console.log('Starting update of weight loss claims...');
    const updateStart = Date.now();
    await updateDiabetesClaims(client, fileId);
    console.log(`Finished updating claims in ${Date.now() - updateStart} ms`);
    
    // Step 3: Save results to savings_results table with category "P1_GLP1_Diabetes"
    await saveResultsToDatabase(client, fileId, 'P1_GLP1_Diabetes', result);

    return {
      statusCode: 200,
      body: {
        message: 'Diabetes savings analysis completed successfully',
        fileId,
        opportunityId,
        result
      }
    };
  } catch (error) {
    console.error('Error during diabetes savings analysis:', error);
    return {
      statusCode: 500,
      body: {
        message: 'Diabetes savings analysis failed',
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
 * Analyze diabetes medication savings based on claims data
 */
async function analyzeDiabetesSavings(client: Client, fileId: string) {
  const query = `
  WITH base_claims AS (
  SELECT
    cr.record_id,
    cr.file_id,
    LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') AS ndc11,
    COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) AS days_supply,
    COALESCE((cr.lookup_fields->>'member_copay')::numeric, 0) AS member_copay,
    cr.lookup_fields->>'incumbent_rebate_type' AS rebate_type,
    cr.mapped_fields->>'member_id' AS member_id,
    LEFT(cr.lookup_fields->>'brnd_gnrc', 1) AS brnd_gnrc_flag,
    dm.gpi4
  FROM edpm.claim_records cr
  JOIN edpm.drugs_master dm
    ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
   AND LEFT(cr.lookup_fields->>'brnd_gnrc', 1) = LEFT(dm.brnd_gnrc, 1)
  WHERE cr.file_id = $1
    AND cr.lookup_fields->>'is_in_formulary' = 'true'
    AND cr.exclusion_type is NULL
    AND cr.lookup_fields->>'specialty_indicator' = 'N'
    AND dm.gpi4 = '2717'
),

filtered_drugs AS (
  SELECT DISTINCT ON (LEFT(brnd_gnrc, 1))
    LEFT(brnd_gnrc, 1) AS drug_type,
    gpi2_awp_per_ds,
    gpi2_rebate_yield
  FROM edpm.drugs_master
  WHERE gpi4 = '2717'
    AND LEFT(brnd_gnrc, 1) IN ('B', 'G')
),

claims_with_costs AS (
  SELECT
    bc.record_id,
    bc.member_id,
    bc.brnd_gnrc_flag,
    fd.drug_type,
    GREATEST(
      CASE
        WHEN fd.drug_type = 'B' THEN
          ((fd.gpi2_awp_per_ds * (1 - 0.2044) * bc.days_supply) - bc.member_copay)
          - (
            fd.gpi2_awp_per_ds * bc.days_supply *
            CASE WHEN bc.rebate_type = 'noRebates' THEN 0 ELSE fd.gpi2_rebate_yield END
          )
        WHEN fd.drug_type = 'G' THEN
          ((fd.gpi2_awp_per_ds * (1 - 0.8739) * bc.days_supply) - bc.member_copay)
        ELSE 0
      END,
    0) AS net_cost,

    -- ✅ New actual cost fields
    CASE
      WHEN bc.brnd_gnrc_flag = 'B' AND fd.drug_type = 'B' THEN
        ((fd.gpi2_awp_per_ds * (1 - 0.2044) * bc.days_supply) - bc.member_copay)
        - (
          fd.gpi2_awp_per_ds * bc.days_supply *
          CASE WHEN bc.rebate_type = 'noRebates' THEN 0 ELSE fd.gpi2_rebate_yield END
        )
      ELSE 0
    END AS actual_brand_cost,

    CASE
      WHEN bc.brnd_gnrc_flag = 'G' AND fd.drug_type = 'G' THEN
        ((fd.gpi2_awp_per_ds * (1 - 0.8739) * bc.days_supply) - bc.member_copay)
      ELSE 0
    END AS actual_generic_cost

  FROM base_claims bc
  JOIN filtered_drugs fd ON TRUE  -- join with both brand and generic
),

totals AS (
  SELECT
    SUM(CASE WHEN drug_type = 'B' THEN net_cost ELSE 0 END) AS brand_cost,
    SUM(CASE WHEN drug_type = 'G' THEN net_cost ELSE 0 END) AS generic_cost,
    SUM(actual_brand_cost) AS actual_brand_cost,
    SUM(actual_generic_cost) AS actual_generic_cost,
    COUNT(DISTINCT record_id) AS claim_count,
    COUNT(DISTINCT member_id) AS member_count
  FROM claims_with_costs
)

SELECT json_build_object(
  'Brand Cost', ROUND(brand_cost, 2),
  'Generic Cost', ROUND(generic_cost, 2),
  'Brand Cost CSV', ROUND(actual_brand_cost, 2),
  'Generic Cost CSV', ROUND(actual_generic_cost, 2),
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
    console.error('Error during diabetes savings analysis:', error);
    throw error;
  }
}

/**
 * Update claim records with diabetes flags
 */
async function updateDiabetesClaims(client: Client, fileId: string) {
  try {
    // Step 1: First select all eligible record_ids
    const selectQuery = `
      SELECT cr_inner.record_id
      FROM edpm.claim_records cr_inner
      JOIN edpm.drugs_master dm
        ON LPAD(TRIM(cr_inner.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
       AND LEFT(cr_inner.lookup_fields->>'brnd_gnrc', 1) = LEFT(dm.brnd_gnrc, 1)
      WHERE cr_inner.file_id = $1
        AND cr_inner.lookup_fields->>'is_in_formulary' = 'true'
        AND cr_inner.exclusion_type IS NULL
        AND cr_inner.lookup_fields->>'specialty_indicator' = 'N'
        AND dm.gpi4 = '2717'
    `;

    const { rows } = await client.query(selectQuery, [fileId]);
    const recordIds = rows.map((r: any) => r.record_id);

    if (recordIds.length === 0) {
      console.log('No claims to update for diabetes.');
      return 0;
    }

    console.log(`Found ${recordIds.length} claim records to update.`);

    // Step 2: Then update using WHERE record_id = ANY(array)
    const updateQuery = `
      UPDATE edpm.claim_records
      SET exclusion_type = 'B_GLP1_DB',
          updated_at = CURRENT_TIMESTAMP,
          updated_by = 'lambda-diabetes-processor'
      WHERE record_id = ANY($1)
    `;

    const updateResult = await client.query(updateQuery, [recordIds]);
    console.log(`Updated ${updateResult.rowCount} claim records with B_GLP1_DB exclusion_type`);
    return updateResult.rowCount;

  } catch (error) {
    console.error('Error updating diabetes claims:', error);
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
    const createdBy = 'lambda-diabetes-processor';
    
    // First, delete any existing records for this file and category
    try {
      await client.query(`
        DELETE FROM edpm.savings_results 
        WHERE file_id = $1 AND category = $2
      `, [fileId, category]);
    } catch (deleteError) {
      console.log('No existing records to delete or error during deletion:', deleteError);
      // Continue with insert even if delete fails
    }

    // Insert query to save results
    const insertQuery = `
      INSERT INTO edpm.savings_results (
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