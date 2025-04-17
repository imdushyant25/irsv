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
        console.log('Starting HDHP, ACA and Rebate analyses in parallel');
        const [hdgpResults, acaResults, rebateResults] = await Promise.all([
            analyzeHdhpPreventive(client, fileId),
            analyzeAcaPreventive(client, fileId),
            analyzeRebateFinancial(client, fileId)
        ]);
        // Save all results in parallel
        await Promise.all([
            saveResultsToDatabase(client, fileId, 'fcHDHP', hdgpResults),
            saveResultsToDatabase(client, fileId, 'fcACA', acaResults),
            saveResultsToDatabase(client, fileId, 'fcRebate', rebateResults)
        ]);
        console.log('HDHP, ACA and Rebate analyses completed and saved in parallel');
        return {
            statusCode: 200,
            body: {
                message: 'Financial analysis completed successfully',
                fileId,
                opportunityId,
                hdgpResults,
                acaResults,
                rebateResults
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
        COALESCE((cr.mapped_fields->>'plan_cost')::numeric, 0) AS plan_cost,
        COALESCE((cr.lookup_fields->>'member_copay')::numeric, 0) AS member_copay,
        cr.mapped_fields->>'preventive_drug' = 'true' AS is_preventive,
        dm.is_hdhp = 'Y' AS is_on_hdhd_list
      FROM claim_records cr
      LEFT JOIN drugs_master dm
        ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
      WHERE cr.file_id = $1
    ),
    qualified_claims AS (
      SELECT *
      FROM base_claims
      WHERE is_preventive OR is_on_hdhd_list
    ),
    categorized AS (
      SELECT
        CASE
          WHEN member_copay > 0 THEN 'Additional Plan Expense'
          ELSE 'Potential Savings Opportunity'
        END AS category,
        SUM(CASE WHEN member_copay > 0 THEN member_copay ELSE plan_cost END) AS total_cost,
        COUNT(DISTINCT member_id) AS impacted_members
      FROM qualified_claims
      GROUP BY category
    ),
    member_summary AS (
      SELECT
        'Total Impacted Members' AS category,
        NULL::numeric AS total_cost,
        COUNT(DISTINCT member_id) AS impacted_members
      FROM qualified_claims
    )
    SELECT json_agg(result) AS hdhp_preventive_summary
    FROM (
      SELECT * FROM categorized
      UNION ALL
      SELECT * FROM member_summary
    ) result
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
        COALESCE((cr.mapped_fields->>'plan_cost')::numeric, 0) AS plan_cost,
        COALESCE((cr.lookup_fields->>'member_copay')::numeric, 0) AS member_copay,
        cr.mapped_fields->>'preventive_drug' = 'true' AS is_preventive,
        dm.is_aca = 'Y' AS is_on_aca_list
      FROM claim_records cr
      LEFT JOIN drugs_master dm
        ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
      WHERE cr.file_id = $1
    ),
    qualified_claims AS (
      SELECT *
      FROM base_claims
      WHERE is_preventive OR is_on_aca_list
    ),
    categorized AS (
      SELECT
        CASE
          WHEN member_copay > 0 THEN 'Additional Plan Expense'
          ELSE 'Potential Savings Opportunity'
        END AS category,
        SUM(CASE WHEN member_copay > 0 THEN member_copay ELSE plan_cost END) AS total_cost,
        COUNT(DISTINCT member_id) AS impacted_members
      FROM qualified_claims
      GROUP BY category
    ),
    member_summary AS (
      SELECT
        'Total Impacted Members' AS category,
        NULL::numeric AS total_cost,
        COUNT(DISTINCT member_id) AS impacted_members
      FROM qualified_claims
    )
    SELECT json_agg(result) AS aca_preventive_summary
    FROM (
      SELECT * FROM categorized
      UNION ALL
      SELECT * FROM member_summary
    ) result
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
        COALESCE((cr.mapped_fields->>'plan_cost')::numeric, 0) AS plan_cost,
        dm.is_rebate_elig = 'Y' AS is_rebate_eligible
      FROM claim_records cr
      JOIN drugs_master dm
        ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
      WHERE cr.file_id = $1
        AND LEFT(cr.lookup_fields->>'brnd_gnrc', 1) = 'B' -- Only brand drugs
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
