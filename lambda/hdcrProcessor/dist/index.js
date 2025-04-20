"use strict";
// File: lambda/hdcrProcessor/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const pg_1 = require("pg");
const uuid_1 = require("uuid");
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
const handler = async (event) => {
    console.log('Starting HDCR savings analysis with event:', JSON.stringify(event));
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
    }
    catch (error) {
        console.error('Error during HDCR savings analysis:', error);
        return {
            statusCode: 500,
            body: {
                message: 'HDCR savings analysis failed',
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
 * Analyze high dollar claim review (HDCR) savings based on claim costs
 */
async function analyzeHdcrSavings(client, fileId) {
    var _a;
    const query = `
  WITH base_claims AS (
    SELECT
      cr.record_id,
      cr.file_id,
      cr.lookup_fields,
      cr.mapped_fields,
      LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') AS ndc11,
      LEFT(cr.lookup_fields->>'brnd_gnrc', 1) AS brand_generic_flag,
      COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) AS days_supply,
      COALESCE((cr.lookup_fields->>'member_copay')::numeric, 0) AS member_copay,
      COALESCE((cr.lookup_fields->>'reprice_gross_cost')::numeric, 0) AS plan_cost,
      cr.mapped_fields->>'member_id' AS member_id
    FROM claim_records cr
    WHERE cr.file_id = $1
      AND cr.lookup_fields->>'is_in_formulary' = 'true'
      AND NOT (cr.lookup_fields ? 'Exclusion Type')
      AND cr.lookup_fields->>'specialty_indicator' = 'N'
  ),
  hdcr_filtered AS (
    SELECT *
    FROM base_claims
    WHERE 
      (plan_cost >= 1000 AND days_supply <= 30)
      OR (plan_cost >= 2000 AND days_supply BETWEEN 31 AND 60)
      OR (plan_cost >= 3000 AND days_supply > 60)
  ),
  claims_with_costs AS (
    SELECT
      bc.brand_generic_flag,
      bc.member_id,
      CASE
        WHEN bc.brand_generic_flag LIKE 'B%' THEN
          ((dm.gpi6_awp_per_ds * (1 - 0.2044) * bc.days_supply) - bc.member_copay)
          - (dm.gpi6_awp_per_ds * bc.days_supply * dm.gpi6_rebate_yield)
        WHEN bc.brand_generic_flag LIKE 'G%' THEN
          ((dm.gpi6_awp_per_ds * (1 - 0.8739) * bc.days_supply) - bc.member_copay)
        ELSE NULL
      END AS net_cost
    FROM hdcr_filtered bc
    JOIN drugs_master dm
      ON bc.ndc11 = dm.ndc11
     AND bc.brand_generic_flag = LEFT(dm.brnd_gnrc, 1)
  ),
  totals AS (
    SELECT
      SUM(CASE WHEN brand_generic_flag LIKE 'B%' THEN net_cost ELSE 0 END) AS brand_cost,
      SUM(CASE WHEN brand_generic_flag LIKE 'G%' THEN net_cost ELSE 0 END) AS generic_cost,
      COUNT(*) AS claim_count,
      COUNT(DISTINCT member_id) AS member_count
    FROM claims_with_costs
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
        return ((_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.result) || null;
    }
    catch (error) {
        console.error('Error during HDCR savings analysis:', error);
        throw error;
    }
}
/**
 * Update claim records with HDCR flags
 */
async function updateHdcrClaims(client, fileId) {
    const query = `
  UPDATE claim_records cr
  SET lookup_fields = jsonb_set(cr.lookup_fields, '{Exclusion Type}', to_jsonb('C_HDCR'::text), true)
  FROM (
    SELECT cr.record_id
    FROM claim_records cr
    JOIN drugs_master dm
      ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
     AND LEFT(cr.lookup_fields->>'brnd_gnrc', 1) = LEFT(dm.brnd_gnrc, 1)
    WHERE cr.file_id = $1
      AND cr.lookup_fields->>'is_in_formulary' = 'true'
      AND cr.lookup_fields->>'specialty_indicator' = 'N'
      AND (
        (COALESCE((cr.mapped_fields->>'plan_cost')::numeric, 0) >= 1000 AND COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) <= 30)
        OR (COALESCE((cr.mapped_fields->>'plan_cost')::numeric, 0) >= 2000 AND COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) BETWEEN 31 AND 60)
        OR (COALESCE((cr.mapped_fields->>'plan_cost')::numeric, 0) >= 3000 AND COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) > 60)
      )
  ) AS eligible
  WHERE cr.record_id = eligible.record_id AND cr.file_id = $1;
  `;
    try {
        const result = await client.query(query, [fileId]);
        console.log(`Updated ${result.rowCount} claim records with HDCR flags`);
        return result.rowCount;
    }
    catch (error) {
        console.error('Error updating HDCR claims:', error);
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
        const createdBy = 'lambda-hdcr-processor';
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
