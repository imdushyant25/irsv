"use strict";
// File: lambda/savingsResultsProcessor/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const pg_1 = require("pg");
// Database config
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
/**
 * Lambda handler to fetch savings results from the database
 * @param event The Lambda event with parameters
 */
const handler = async (event) => {
    console.log('Starting savings results fetch with event:', JSON.stringify(event));
    const { fileId, opportunityId, category } = event;
    if (!fileId) {
        throw new Error('Missing required parameter: fileId is required');
    }
    const client = new pg_1.Client(dbConfig);
    try {
        await client.connect();
        if (process.env.DB_SCHEMA) {
            await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
        }
        // Fetch results based on parameters
        if (category) {
            // Fetch specific category
            const results = await fetchCategoryResults(client, fileId, category);
            return {
                statusCode: 200,
                body: {
                    message: `Savings results fetched successfully for category: ${category}`,
                    fileId,
                    opportunityId,
                    category,
                    data: results
                }
            };
        }
        else {
            // Fetch all categories
            const results = await fetchAllResults(client, fileId);
            return {
                statusCode: 200,
                body: {
                    message: 'All savings results fetched successfully',
                    fileId,
                    opportunityId,
                    data: results
                }
            };
        }
    }
    catch (error) {
        console.error('Error fetching savings results:', error);
        return {
            statusCode: 500,
            body: {
                message: 'Failed to fetch savings results',
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
 * Fetch results for a specific category
 */
async function fetchCategoryResults(client, fileId, category) {
    const query = `
    SELECT 
      id,
      file_id,
      category,
      results,
      created_at,
      created_by,
      updated_at,
      updated_by
    FROM savings_results
    WHERE file_id = $1 AND category = $2
    ORDER BY created_at DESC
  `;
    const result = await client.query(query, [fileId, category]);
    if (result.rows.length === 0) {
        return null;
    }
    // Parse the JSONB results field
    const data = result.rows[0];
    try {
        if (typeof data.results === 'string') {
            data.results = JSON.parse(data.results);
        }
    }
    catch (error) {
        console.warn('Error parsing results JSON:', error);
    }
    return data;
}
/**
 * Fetch results for all categories
 */
async function fetchAllResults(client, fileId) {
    const query = `
    SELECT 
      id,
      file_id,
      category,
      results,
      created_at,
      created_by,
      updated_at,
      updated_by
    FROM savings_results
    WHERE file_id = $1
    ORDER BY category, created_at DESC
  `;
    const result = await client.query(query, [fileId]);
    if (result.rows.length === 0) {
        return {};
    }
    // Group by category
    const resultsByCategory = {};
    for (const row of result.rows) {
        try {
            // Parse the JSONB results field if it's a string
            if (typeof row.results === 'string') {
                row.results = JSON.parse(row.results);
            }
            resultsByCategory[row.category] = row;
        }
        catch (error) {
            console.warn(`Error parsing results JSON for category ${row.category}:`, error);
            resultsByCategory[row.category] = row;
        }
    }
    return resultsByCategory;
}
