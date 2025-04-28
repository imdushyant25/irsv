// File: lambda/contractSavingsProcessor/index.ts

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
  console.log('Starting Contract Savings analysis with event:', JSON.stringify(event));

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

    // Step 1: Run the Contract Savings analysis
    const result = await analyzeContractSavings(client, fileId);
    
    // Step 2: Save results to savings_results table with category "contractSavings"
    await saveResultsToDatabase(client, fileId, 'contractSavings', result);

    return {
      statusCode: 200,
      body: {
        message: 'Contract Savings analysis completed successfully',
        fileId,
        opportunityId,
        result
      }
    };
  } catch (error) {
    console.error('Error during Contract Savings analysis:', error);
    return {
      statusCode: 500,
      body: {
        message: 'Contract Savings analysis failed',
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
 * Analyze contract savings based on exclusion types
 */
async function analyzeContractSavings(client: Client, fileId: string) {
  const query = `
  WITH claim_data AS (
  SELECT
    CASE 
      WHEN cr.exclusion_type IS NULL THEN 'Reprice'
      ELSE cr.exclusion_type
    END AS exclusion_type,

    CASE
      WHEN cr.lookup_fields->>'incumbent_rebate_type' = 'noRebates' THEN 
        COALESCE((cr.mapped_fields->>'plan_cost')::numeric, 0)
      ELSE 
        COALESCE((cr.mapped_fields->>'plan_cost')::numeric, 0) -
        COALESCE((cr.lookup_fields->>'incumbent_rebate')::numeric, 0)
    END AS incumbent_plan_cost,

    CASE
      WHEN LEFT(cr.lookup_fields->>'brnd_gnrc', 1) = 'B' THEN
        COALESCE((cr.lookup_fields->>'reprice_plan_cost')::numeric, 0)
      ELSE
        COALESCE((cr.lookup_fields->>'reprice_net_plan_cost')::numeric, 0)
    END AS illuminate_plan_cost,

    cr.mapped_fields->>'member_id' AS member_id

  FROM edpm.claim_records cr
  WHERE cr.file_id = $1
    AND cr.lookup_fields->>'is_in_formulary' = 'true'
    AND COALESCE(cr.exclusion_type, '') NOT IN ('Plan', 'E_QL')
),
grouped AS (
  SELECT
    CASE
      WHEN exclusion_type = 'A_GLP1_WL' THEN 'GLP-1 Weight Loss'
      WHEN exclusion_type = 'B_GLP1_DB' THEN 'GLP-1 Diabetes'
      WHEN exclusion_type = 'C_HDCR'     THEN 'HDCR'
      WHEN exclusion_type = 'D_PA'       THEN 'Prior Auth'
      WHEN exclusion_type = 'E_QL'       THEN 'Quantity Limits'
      ELSE exclusion_type
    END AS exclusion_type,

    ROUND(SUM(incumbent_plan_cost), 2) AS incumbent_plan_cost,
    ROUND(SUM(illuminate_plan_cost), 2) AS illuminate_plan_cost,
    COUNT(DISTINCT member_id) AS member_count,
    COUNT(*) AS claim_count,
    ROUND((SUM(incumbent_plan_cost) - SUM(illuminate_plan_cost)) * 0.65, 2) AS gross_savings
  FROM claim_data
  GROUP BY exclusion_type
)
SELECT json_agg(result) AS exclusion_summary
FROM grouped result;
  `;

  try {
    const result = await client.query(query, [fileId]);
    return result.rows[0]?.exclusion_summary || null;
  } catch (error) {
    console.error('Error during Contract Savings analysis:', error);
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
    const createdBy = 'lambda-contract-savings-processor';
    
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