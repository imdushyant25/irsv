// File: lambda/exclusionsProcessor/index.ts

import { Client } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  statement_timeout: 50000,
  query_timeout: 50000,
  idle_in_transaction_session_timeout: 50000
};

export const handler = async (event: any) => {
  console.log('Starting exclusions analysis with event:', JSON.stringify(event));

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

    const result = await analyzeExclusions(client, fileId, opportunityId);
    await stampExcludedClaims(client, fileId, opportunityId);
    
    // Save results to savings_results table with category "plans" for Clinical Savings tab
    await saveResultsToDatabase(client, fileId, 'plans', result);

    return {
      statusCode: 200,
      body: {
        message: 'Exclusions analysis completed successfully',
        fileId,
        opportunityId,
        result
      }
    };
  } catch (error) {
    console.error('Error during exclusions analysis:', error);
    return {
      statusCode: 500,
      body: {
        message: 'Exclusions analysis failed',
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

async function analyzeExclusions(client: Client, fileId: string, opportunityId: string) {
  const query = `
    WITH file_link AS (
  SELECT file_id, opportunity_id
  FROM edpm.claims_file_registry
  WHERE opportunity_id = $1 AND file_id = $2
),
file_claims AS (
  SELECT
    cr.record_id,
    cr.lookup_fields,
    (cr.mapped_fields->>'plan_cost')::numeric AS plan_cost,
    cr.mapped_fields->>'member_id' AS member_id
  FROM edpm.claim_records cr
  JOIN file_link fl ON cr.file_id = fl.file_id
),
all_exclusion_keys AS (
  SELECT DISTINCT REPLACE(key, 'px_', '') AS exclusion_name, 'Plan' AS exclusion_type
  FROM file_claims, jsonb_each_text(lookup_fields)
  WHERE key LIKE 'px_%' AND value = 'true'
),
plan_exclusion_claims AS (
  SELECT DISTINCT
    'Plan' AS exclusion_type,
    REPLACE(key, 'px_', '') AS exclusion_name,
    fc.plan_cost,
    fc.member_id,
    fc.record_id
  FROM file_claims fc,
       jsonb_each_text(fc.lookup_fields) AS kv(key, value)
  WHERE key LIKE 'px_%'
    AND value = 'true'
    AND fc.lookup_fields->>REPLACE(key, 'px_', '') = 'Y'
),
grouped AS (
  SELECT
    exclusion_type,
    exclusion_name,
    SUM(plan_cost) AS total_plan_cost,
    COUNT(*) AS claim_count,
    COUNT(DISTINCT member_id) AS member_count
  FROM plan_exclusion_claims
  GROUP BY exclusion_type, exclusion_name
),
final_grouped AS (
  SELECT
    ak.exclusion_type,
    ak.exclusion_name,
    COALESCE(g.total_plan_cost, 0) AS total_plan_cost,
    COALESCE(g.claim_count, 0) AS claim_count,
    COALESCE(g.member_count, 0) AS member_count
  FROM all_exclusion_keys ak
  LEFT JOIN grouped g
    ON ak.exclusion_type = g.exclusion_type
    AND ak.exclusion_name = g.exclusion_name
),
final_results AS (
  SELECT
    exclusion_type,
    exclusion_name,
    total_plan_cost,
    claim_count,
    member_count,
    1 AS sort_order
  FROM final_grouped

  UNION ALL

  SELECT
    exclusion_type,
    'TOTAL',
    SUM(total_plan_cost),
    SUM(claim_count),
    SUM(member_count),
    2
  FROM final_grouped
  GROUP BY exclusion_type

  UNION ALL

  SELECT
    'OVERALL TOTAL',
    NULL,
    SUM(total_plan_cost),
    SUM(claim_count),
    SUM(member_count),
    3
  FROM final_grouped
)

SELECT json_build_object(
  'results', (
    SELECT json_agg(
      json_build_object(
        'exclusion_type', exclusion_type,
        'exclusion_name', exclusion_name,
        'total_plan_cost', total_plan_cost,
        'claim_count', claim_count,
        'member_count', member_count,
        'sort_order', sort_order
      )
      ORDER BY sort_order, exclusion_type, exclusion_name
    )
    FROM final_results
  )
) AS results;

  `;

  const result = await client.query(query, [opportunityId, fileId]);
  return result.rows[0]?.results || null;
}

async function stampExcludedClaims(client: Client, fileId: string, opportunityId: string) {
  const updateQuery = `
    WITH file_claims AS (
  SELECT
    cr.record_id::uuid,
    cr.lookup_fields
  FROM edpm.claim_records cr
  JOIN edpm.claims_file_registry fr ON cr.file_id = fr.file_id
  WHERE fr.opportunity_id = $1 AND cr.file_id = $2
),
plan_exclusion_claims AS (
  SELECT DISTINCT
    fc.record_id::uuid AS record_id,
    'Plan' AS exclusion_type
  FROM file_claims fc,
       jsonb_each_text(fc.lookup_fields) AS kv(key, value)
  WHERE key LIKE 'px_%'
    AND value = 'true'
    AND fc.lookup_fields ? REPLACE(key, 'px_', '')
    AND fc.lookup_fields->>REPLACE(key, 'px_', '') = 'Y'
)

UPDATE edpm.claim_records cr
SET lookup_fields = cr.lookup_fields || jsonb_build_object(
  'Exclusion', 'Y',
  'Exclusion Type', pec.exclusion_type
)
FROM plan_exclusion_claims pec
WHERE cr.record_id = pec.record_id;
  `;

  await client.query(updateQuery, [opportunityId, fileId]);
}

/**
 * Save analysis results to the savings_results table
 */
async function saveResultsToDatabase(client: Client, fileId: string, category: string, results: any) {
  try {
    // Generate a new UUID for this result
    const resultId = uuidv4();
    
    // Get user info for created_by field
    const createdBy = 'lambda-exclusions-processor';
    
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

    // Insert query to save results - without ON CONFLICT
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