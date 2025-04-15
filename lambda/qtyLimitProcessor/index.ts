// File: lambda/qtyLimitProcessor/index.ts

import { Client } from 'pg';

export const handler = async (event: any) => {
  console.log('Starting Quantity Limits processor with event:', JSON.stringify(event));
  
  const { fileId, opportunityId, workflowId } = event;
  
  if (!fileId) {
    throw new Error('Missing required parameter: fileId');
  }
  
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    
    if (process.env.DB_SCHEMA) {
      await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
    }
    
    // Step 1: Analyze quantity limits savings based on provided SQL query
    const results = await analyzeQuantityLimitsSavings(client, fileId);
    
    // Step 2: Update claims with QL_Standard exclusion type
    const updatedCount = await updateQuantityLimitsClaims(client, fileId);
    
    // Step 3: Store results in the savings_results table
    if (results) {
      await saveResultsToDatabase(client, fileId, opportunityId, results);
    }
    
    console.log(`Quantity Limits processor completed for file ${fileId}. Analysis results:`, results);
    
    return {
      statusCode: 200,
      body: {
        message: 'Quantity Limits analysis completed successfully',
        fileId,
        opportunityId,
        workflowId,
        updatedCount,
        results
      }
    };
  } catch (error) {
    console.error('Error in Quantity Limits processor:', error);
    
    return {
      statusCode: 500,
      body: {
        message: 'Quantity Limits analysis failed',
        fileId,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  } finally {
    try {
      await client.end();
    } catch (e) {
      console.error('Error closing database connection:', e);
    }
  }
};

/**
 * Analyze quantity limits savings based on provided SQL query
 */
async function analyzeQuantityLimitsSavings(client: Client, fileId: string) {
  console.log(`Analyzing quantity limits savings for file ${fileId}`);
  
  const query = `
    WITH base_claims AS (
      SELECT
        cr.record_id,
        cr.file_id,
        cr.lookup_fields,
        cr.mapped_fields,
        LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') AS ndc11,
        cr.lookup_fields->>'quantity' AS raw_quantity,
        cr.lookup_fields->>'days_supply' AS raw_days_supply,
        cr.lookup_fields->>'mspan_unit_price' AS raw_unit_price,
        cr.mapped_fields->>'member_id' AS member_id
      FROM claim_records cr
      WHERE cr.file_id = $1
        AND NOT (cr.lookup_fields ? 'Exclusion Type')
    )
    , numeric_fields AS (
      SELECT
        bc.record_id,
        bc.file_id,
        bc.member_id,
        COALESCE(bc.raw_quantity::numeric, 0) AS quantity,
        COALESCE(bc.raw_days_supply::numeric, 0) AS days_supply,
        COALESCE(bc.raw_unit_price::numeric, 0) AS mspan_unit_price,
        bc.ndc11
      FROM base_claims bc
    )
    , claims_with_costs AS (
      SELECT
        nf.record_id,
        nf.member_id,
        nf.quantity,
        nf.days_supply,
        nf.mspan_unit_price,
        dm.ql_qty_ds,
        CASE
          WHEN nf.days_supply > 0 AND (nf.quantity / nf.days_supply) > dm.ql_qty_ds THEN
            ((nf.quantity / nf.days_supply) - dm.ql_qty_ds) * nf.mspan_unit_price
          ELSE 0
        END AS potential_savings
      FROM numeric_fields nf
      JOIN drugs_master dm
        ON nf.ndc11 = dm.ndc11
      WHERE dm.is_ql_standard = 'Y'
    )
    SELECT json_build_object(
      'Potential Savings', ROUND(SUM(potential_savings), 2),
      'Claim Count', COUNT(*),
      'Member Count', COUNT(DISTINCT member_id)
    ) AS result
    FROM claims_with_costs;
  `;
  
  try {
    const result = await client.query(query, [fileId]);
    const savingsData = result.rows[0]?.result;
    
    console.log(`Quantity limits savings analysis results for file ${fileId}:`, savingsData);
    
    // Transform the data to match expected format for UI display
    const transformedResults = {
      'Brand Cost': savingsData['Potential Savings'] || 0,
      'Generic Cost': 0, // Not applicable for this analysis
      'Claim Count': savingsData['Claim Count'] || 0,
      'Member Count': savingsData['Member Count'] || 0,
      'Part 1 Potential Savings': savingsData['Potential Savings'] || 0
    };
    
    return transformedResults;
  } catch (error) {
    console.error(`Error analyzing quantity limits savings for file ${fileId}:`, error);
    throw error;
  }
}

/**
 * Update claims with QL_Standard exclusion type
 */
async function updateQuantityLimitsClaims(client: Client, fileId: string) {
  console.log(`Updating claims with QL_Standard exclusion type for file ${fileId}`);
  
  const query = `
    UPDATE claim_records cr
    SET lookup_fields = jsonb_set(cr.lookup_fields, '{Exclusion Type}', to_jsonb('QL_Standard'::text), true)
    FROM (
      SELECT cr.record_id
      FROM claim_records cr
      JOIN drugs_master dm
        ON LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') = dm.ndc11
      WHERE cr.file_id = $1
        AND dm.is_ql_standard = 'Y'
        AND NOT (cr.lookup_fields ? 'Exclusion Type')
        AND COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0) > 0
        AND (
          (COALESCE((cr.lookup_fields->>'quantity')::numeric, 0) / COALESCE((cr.lookup_fields->>'days_supply')::numeric, 0))
          > dm.ql_qty_ds
        )
        AND COALESCE((cr.lookup_fields->>'mspan_unit_price')::numeric, 0) > 0
    ) AS eligible
    WHERE cr.record_id = eligible.record_id;
  `;
  
  try {
    const result = await client.query(query, [fileId]);
    const updatedCount = result.rowCount;
    
    console.log(`Updated ${updatedCount} claims with QL_Standard exclusion type for file ${fileId}`);
    
    return updatedCount;
  } catch (error) {
    console.error(`Error updating claims with QL_Standard exclusion type for file ${fileId}:`, error);
    throw error;
  }
}

/**
 * Store results in the savings_results table
 */
async function saveResultsToDatabase(client: Client, fileId: string, opportunityId: string, results: any) {
  console.log(`Saving quantity limits savings results for file ${fileId} to database`);
  
  const category = 'qtylim';
  const createdBy = 'qtylim-processor';
  
  try {
    // Generate a unique ID for this record
    const resultId = require('crypto').randomUUID();
    
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
      results,
      createdBy
    ]);
    
    console.log(`Successfully saved quantity limits savings results for file ${fileId}`);
  } catch (error) {
    console.error(`Error saving quantity limits savings results for file ${fileId}:`, error);
    throw error;
  }
}