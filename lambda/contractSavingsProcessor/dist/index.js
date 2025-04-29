"use strict";
// File: lambda/contractSavingsProcessor/index.ts
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
    console.log('Starting Contract Savings analysis with event:', JSON.stringify(event));
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
    }
    catch (error) {
        console.error('Error during Contract Savings analysis:', error);
        return {
            statusCode: 500,
            body: {
                message: 'Contract Savings analysis failed',
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
 * Analyze contract savings based on exclusion types
 */
async function analyzeContractSavings(client, fileId) {
    const query = `
  WITH claim_sums AS (
  SELECT
    CASE 
      WHEN cr.exclusion_type = 'A_GLP1_WL' THEN 'GLP-1 Weight Loss'
      WHEN cr.exclusion_type = 'B_GLP1_DB' THEN 'GLP-1 Diabetes'
      WHEN cr.exclusion_type = 'C_HDCR' THEN 'HDCR'
      WHEN cr.exclusion_type = 'D_PA' THEN 'Prior Authorization'
      WHEN cr.exclusion_type IS NULL THEN 'Reprice'
    END AS exclusion_type,
    SUM(COALESCE((cr.mapped_fields->>'plan_cost')::numeric, 0)) AS total_plan_cost,
    SUM(COALESCE((cr.lookup_fields->>'incumbent_rebate')::numeric, 0)) AS total_incumbent_rebate,
    SUM(CASE WHEN cr.exclusion_type IS NULL THEN COALESCE((cr.lookup_fields->>'reprice_net_plan_cost')::numeric, 0) ELSE 0 END) AS total_reprice_net_plan_cost,
    COUNT(DISTINCT cr.mapped_fields->>'member_id') AS member_count,
    COUNT(*) AS claim_count
  FROM claim_records cr
  WHERE cr.file_id = $1
    AND (cr.exclusion_type IN ('A_GLP1_WL', 'B_GLP1_DB', 'C_HDCR', 'D_PA') OR cr.exclusion_type IS NULL)
  GROUP BY 1
),
savings_base AS (
  SELECT
    CASE
      WHEN sr.category = 'P1_GLP1_Wght_Loss' THEN 'GLP-1 Weight Loss'
      WHEN sr.category = 'P1_GLP1_Diabetes' THEN 'GLP-1 Diabetes'
      WHEN sr.category = 'hdcr' THEN 'HDCR'
      WHEN sr.category = 'priorauth' THEN 'Prior Authorization'
    END AS exclusion_type,
    (sr.results->>'Brand Cost')::numeric AS brand_cost,
    (sr.results->>'Generic Cost')::numeric AS generic_cost
  FROM edpm.savings_results sr
  WHERE sr.file_id = $1
    AND sr.category IN ('P1_GLP1_Wght_Loss', 'P1_GLP1_Diabetes', 'hdcr', 'priorauth')
),
final_data AS (
  SELECT
    cs.exclusion_type,
    cs.total_plan_cost - cs.total_incumbent_rebate AS incumbent_plan_cost,
    CASE 
      WHEN cs.exclusion_type = 'Reprice' THEN cs.total_reprice_net_plan_cost
      ELSE sb.brand_cost + sb.generic_cost
    END AS illuminate_plan_cost,
    cs.member_count,
    cs.claim_count,
    CASE 
      WHEN cs.exclusion_type = 'Reprice' THEN
        (cs.total_plan_cost - cs.total_incumbent_rebate - cs.total_reprice_net_plan_cost)
      ELSE
        (cs.total_plan_cost - cs.total_incumbent_rebate - (sb.brand_cost + sb.generic_cost)) * 0.65
    END AS gross_savings
  FROM claim_sums cs
  LEFT JOIN savings_base sb ON cs.exclusion_type = sb.exclusion_type
)
SELECT json_agg(
  json_build_object(
    'exclusion_type', exclusion_type,
    'incumbent_plan_cost', ROUND(incumbent_plan_cost, 2),
    'illuminate_plan_cost', ROUND(illuminate_plan_cost, 2),
    'member_count', member_count,
    'claim_count', claim_count,
    'gross_savings', ROUND(gross_savings, 2)
  )
) AS exclusion_summary
FROM final_data;
  `;
    try {
        const result = await client.query(query, [fileId]);
        return result.rows[0]?.exclusion_summary || null;
    }
    catch (error) {
        console.error('Error during Contract Savings analysis:', error);
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
        const createdBy = 'lambda-contract-savings-processor';
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsaURBQWlEOzs7QUFFakQsMkJBQTRCO0FBQzVCLCtCQUFvQztBQUVwQyxNQUFNLFFBQVEsR0FBRztJQUNmLElBQUksRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU87SUFDekIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sSUFBSSxNQUFNLENBQUM7SUFDN0MsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTztJQUM3QixJQUFJLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPO0lBQ3pCLFFBQVEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVc7SUFDakMsR0FBRyxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFO0lBQ2xDLHVCQUF1QixFQUFFLEtBQUs7SUFDOUIsaUJBQWlCLEVBQUUsTUFBTSxFQUFPLFlBQVk7SUFDNUMsYUFBYSxFQUFFLE1BQU0sRUFBVyxZQUFZO0lBQzVDLG1DQUFtQyxFQUFFLE1BQU07Q0FDNUMsQ0FBQztBQUVLLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxLQUFVLEVBQUUsRUFBRTtJQUMxQyxPQUFPLENBQUMsR0FBRyxDQUFDLGdEQUFnRCxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUVyRixNQUFNLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxHQUFHLEtBQUssQ0FBQztJQUV4QyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDOUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxxRUFBcUUsQ0FBQyxDQUFDO0lBQ3pGLENBQUM7SUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLFdBQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUVwQyxJQUFJLENBQUM7UUFDSCxNQUFN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R0FBRzs7Ozs7Ozs7Ozs7S0FXbkIsQ0FBQztRQUVGLGdDQUFnQztRQUNoQyxNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFO1lBQzlCLFFBQVE7WUFDUixNQUFNO1lBQ04sUUFBUTtZQUNSLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDO1lBQ3ZCLFNBQVM7U0FDVixDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsR0FBRyxDQUFDLG1EQUFtRCxNQUFNLGVBQWUsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUNsRyxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsbUNBQW1DLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIEZpbGU6IGxhbWJkYS9jb250cmFjdFNhdmluZ3NQcm9jZXNzb3IvaW5kZXgudHNcblxuaW1wb3J0IHsgQ2xpZW50IH0gZnJvbSAncGcnO1xuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5cbmNvbnN0IGRiQ29uZmlnID0ge1xuICBob3N0OiBwcm9jZXNzLmVudi5EQl9IT1NULFxuICBwb3J0OiBwYXJzZUludChwcm9jZXNzLmVudi5EQl9QT1JUIHx8ICc1NDMyJyksXG4gIGRhdGFiYXNlOiBwcm9jZXNzLmVudi5EQl9OQU1FLFxuICB1c2VyOiBwcm9jZXNzLmVudi5EQl9VU0VSLFxuICBwYXNzd29yZDogcHJvY2Vzcy5lbnYuREJfUEFTU1dPUkQsXG4gIHNzbDogeyByZWplY3RVbmF1dGhvcml6ZWQ6IGZhbHNlIH0sXG4gIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiAzMDAwMCxcbiAgc3RhdGVtZW50X3RpbWVvdXQ6IDMwMDAwMCwgICAgICAvLyA1IG1pbnV0ZXNcbiAgcXVlcnlfdGltZW91dDogMzAwMDAwLCAgICAgICAgICAvLyA1IG1pbnV0ZXNcbiAgaWRsZV9pbl90cmFuc2FjdGlvbl9zZXNzaW9uX3RpbWVvdXQ6IDMwMDAwMFxufTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IGFueSkgPT4ge1xuICBjb25zb2xlLmxvZygnU3RhcnRpbmcgQ29udHJhY3QgU2F2aW5ncyBhbmFseXNpcyB3aXRoIGV2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50KSk7XG5cbiAgY29uc3QgeyBmaWxlSWQsIG9wcG9ydHVuaXR5SWQgfSA9IGV2ZW50O1xuXG4gIGlmICghZmlsZUlkIHx8ICFvcHBvcnR1bml0eUlkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHJlcXVpcmVkIHBhcmFtZXRlcnM6IGZpbGVJZCBhbmQgb3Bwb3J0dW5pdHlJZCBhcmUgcmVxdWlyZWQuJyk7XG4gIH1cblxuICBjb25zdCBjbGllbnQgPSBuZXcgQ2xpZW50KGRiQ29uZmlnKTtcblxuICB0cnkge1xuICAgIGF3YWl0IGNsaWVudC5jb25uZWN0KCk7XG4gICAgaWYgKHByb2Nlc3MuZW52LkRCX1NDSEVNQSkge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KGBTRVQgc2VhcmNoX3BhdGggVE8gJHtwcm9jZXNzLmVudi5EQl9TQ0hFTUF9YCk7XG4gICAgfVxuXG4gICAgLy8gU3RlcCAxOiBSdW4gdGhlIENvbnRyYWN0IFNhdmluZ3MgYW5hbHlzaXNcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBhbmFseXplQ29udHJhY3RTYXZpbmdzKGNsaWVudCwgZmlsZUlkKTtcbiAgICBcbiAgICAvLyBTdGVwIDI6IFNhdmUgcmVzdWx0cyB0byBzYXZpbmdzX3Jlc3VsdHMgdGFibGUgd2l0aCBjYXRlZ29yeSBcImNvbnRyYWN0U2F2aW5nc1wiXG4gICAgYXdhaXQgc2F2ZVJlc3VsdHNUb0RhdGFiYXNlKGNsaWVudCwgZmlsZUlkLCAnY29udHJhY3RTYXZpbmdzJywgcmVzdWx0KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBib2R5OiB7XG4gICAgICAgIG1lc3NhZ2U6ICdDb250cmFjdCBTYXZpbmdzIGFuYWx5c2lzIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICBmaWxlSWQsXG4gICAgICAgIG9wcG9ydHVuaXR5SWQsXG4gICAgICAgIHJlc3VsdFxuICAgICAgfVxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZHVyaW5nIENvbnRyYWN0IFNhdmluZ3MgYW5hbHlzaXM6JywgZXJyb3IpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiB7XG4gICAgICAgIG1lc3NhZ2U6ICdDb250cmFjdCBTYXZpbmdzIGFuYWx5c2lzIGZhaWxlZCcsXG4gICAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcilcbiAgICAgIH1cbiAgICB9O1xuICB9IGZpbmFsbHkge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjbGllbnQuZW5kKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgY2xvc2luZyBjbGllbnQ6JywgZSk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIEFuYWx5emUgY29udHJhY3Qgc2F2aW5ncyBiYXNlZCBvbiBleGNsdXNpb24gdHlwZXNcbiAqL1xuYXN5bmMgZnVuY3Rpb24gYW5hbHl6ZUNvbnRyYWN0U2F2aW5ncyhjbGllbnQ6IENsaWVudCwgZmlsZUlkOiBzdHJpbmcpIHtcbiAgY29uc3QgcXVlcnkgPSBgXG4gIFdJVEggY2xhaW1fc3VtcyBBUyAoXG4gIFNFTEVDVFxuICAgIENBU0UgXG4gICAgICBXSEVOIGNyLmV4Y2x1c2lvbl90eXBlID0gJ0FfR0xQMV9XTCcgVEhFTiAnR0xQLTEgV2VpZ2h0IExvc3MnXG4gICAgICBXSEVOIGNyLmV4Y2x1c2lvbl90eXBlID0gJ0JfR0xQMV9EQicgVEhFTiAnR0xQLTEgRGlhYmV0ZXMnXG4gICAgICBXSEVOIGNyLmV4Y2x1c2lvbl90eXBlID0gJ0NfSERDUicgVEhFTiAnSERDUidcbiAgICAgIFdIRU4gY3IuZXhjbHVzaW9uX3R5cGUgPSAnRF9QQScgVEhFTiAnUHJpb3IgQXV0aG9yaXphdGlvbidcbiAgICAgIFdIRU4gY3IuZXhjbHVzaW9uX3R5cGUgSVMgTlVMTCBUSEVOICdSZXByaWNlJ1xuICAgIEVORCBBUyBleGNsdXNpb25fdHlwZSxcbiAgICBTVU0oQ09BTEVTQ0UoKGNyLm1hcHBlZF9maWVsZHMtPj4ncGxhbl9jb3N0Jyk6Om51bWVyaWMsIDApKSBBUyB0b3RhbF9wbGFuX2Nvc3QsXG4gICAgU1VNKENPQUxFU0NFKChjci5sb29rdXBfZmllbGRzLT4+J2luY3VtYmVudF9yZWJhdGUnKTo6bnVtZXJpYywgMCkpIEFTIHRvdGFsX2luY3VtYmVudF9yZWJhdGUsXG4gICAgU1VNKENBU0UgV0hFTiBjci5leGNsdXNpb25fdHlwZSBJUyBOVUxMIFRIRU4gQ09BTEVTQ0UoKGNyLmxvb2t1cF9maWVsZHMtPj4ncmVwcmljZV9uZXRfcGxhbl9jb3N0Jyk6Om51bWVyaWMsIDApIEVMU0UgMCBFTkQpIEFTIHRvdGFsX3JlcHJpY2VfbmV0X3BsYW5fY29zdCxcbiAgICBDT1VOVChESVNUSU5DVCBjci5tYXBwZWRfZmllbGRzLT4+J21lbWJlcl9pZCcpIEFTIG1lbWJlcl9jb3VudCxcbiAgICBDT1VOVCgqKSBBUyBjbGFpbV9jb3VudFxuICBGUk9NIGNsYWltX3JlY29yZHMgY3JcbiAgV0hFUkUgY3IuZmlsZV9pZCA9ICQxXG4gICAgQU5EIChjci5leGNsdXNpb25fdHlwZSBJTiAoJ0FfR0xQMV9XTCcsICdCX0dMUDFfREInLCAnQ19IRENSJywgJ0RfUEEnKSBPUiBjci5leGNsdXNpb25fdHlwZSBJUyBOVUxMKVxuICBHUk9VUCBCWSAxXG4pLFxuc2F2aW5nc19iYXNlIEFTIChcbiAgU0VMRUNUXG4gICAgQ0FTRVxuICAgICAgV0hFTiBzci5jYXRlZ29yeSA9ICdQMV9HTFAxX1dnaHRfTG9zcycgVEhFTiAnR0xQLTEgV2VpZ2h0IExvc3MnXG4gICAgICBXSEVOIHNyLmNhdGVnb3J5ID0gJ1AxX0dMUDFfRGlhYmV0ZXMnIFRIRU4gJ0dMUC0xIERpYWJldGVzJ1xuICAgICAgV0hFTiBzci5jYXRlZ29yeSA9ICdoZGNyJyBUSEVOICdIRENSJ1xuICAgICAgV0hFTiBzci5jYXRlZ29yeSA9ICdwcmlvcmF1dGgnIFRIRU4gJ1ByaW9yIEF1dGhvcml6YXRpb24nXG4gICAgRU5EIEFTIGV4Y2x1c2lvbl90eXBlLFxuICAgIChzci5yZXN1bHRzLT4+J0JyYW5kIENvc3QnKTo6bnVtZXJpYyBBUyBicmFuZF9jb3N0LFxuICAgIChzci5yZXN1bHRzLT4+J0dlbmVyaWMgQ29zdCcpOjpudW1lcmljIEFTIGdlbmVyaWNfY29zdFxuICBGUk9NIGVkcG0uc2F2aW5nc19yZXN1bHRzIHNyXG4gIFdIRVJFIHNyLmZpbGVfaWQgPSAkMVxuICAgIEFORCBzci5jYXRlZ29yeSBJTiAoJ1AxX0dMUDFfV2dodF9Mb3NzJywgJ1AxX0dMUDFfRGlhYmV0ZXMnLCAnaGRjcicsICdwcmlvcmF1dGgnKVxuKSxcbmZpbmFsX2RhdGEgQVMgKFxuICBTRUxFQ1RcbiAgICBjcy5leGNsdXNpb25fdHlwZSxcbiAgICBjcy50b3RhbF9wbGFuX2Nvc3QgLSBjcy50b3RhbF9pbmN1bWJlbnRfcmViYXRlIEFTIGluY3VtYmVudF9wbGFuX2Nvc3QsXG4gICAgQ0FTRSBcbiAgICAgIFdIRU4gY3MuZXhjbHVzaW9uX3R5cGUgPSAnUmVwcmljZScgVEhFTiBjcy50b3RhbF9yZXByaWNlX25ldF9wbGFuX2Nvc3RcbiAgICAgIEVMU0Ugc2IuYnJhbmRfY29zdCArIHNiLmdlbmVyaWNfY29zdFxuICAgIEVORCBBUyBpbGx1bWluYXRlX3BsYW5fY29zdCxcbiAgICBjcy5tZW1iZXJfY291bnQsXG4gICAgY3MuY2xhaW1fY291bnQsXG4gICAgQ0FTRSBcbiAgICAgIFdIRU4gY3MuZXhjbHVzaW9uX3R5cGUgPSAnUmVwcmljZScgVEhFTlxuICAgICAgICAoY3MudG90YWxfcGxhbl9jb3N0IC0gY3MudG90YWxfaW5jdW1iZW50X3JlYmF0ZSAtIGNzLnRvdGFsX3JlcHJpY2VfbmV0X3BsYW5fY29zdClcbiAgICAgIEVMU0VcbiAgICAgICAgKGNzLnRvdGFsX3BsYW5fY29zdCAtIGNzLnRvdGFsX2luY3VtYmVudF9yZWJhdGUgLSAoc2IuYnJhbmRfY29zdCArIHNiLmdlbmVyaWNfY29zdCkpICogMC42NVxuICAgIEVORCBBUyBncm9zc19zYXZpbmdzXG4gIEZST00gY2xhaW1fc3VtcyBjc1xuICBMRUZUIEpPSU4gc2F2aW5nc19iYXNlIHNiIE9OIGNzLmV4Y2x1c2lvbl90eXBlID0gc2IuZXhjbHVzaW9uX3R5cGVcbilcblNFTEVDVCBqc29uX2FnZyhcbiAganNvbl9idWlsZF9vYmplY3QoXG4gICAgJ2V4Y2x1c2lvbl90eXBlJywgZXhjbHVzaW9uX3R5cGUsXG4gICAgJ2luY3VtYmVudF9wbGFuX2Nvc3QnLCBST1VORChpbmN1bWJlbnRfcGxhbl9jb3N0LCAyKSxcbiAgICAnaWxsdW1pbmF0ZV9wbGFuX2Nvc3QnLCBST1VORChpbGx1bWluYXRlX3BsYW5fY29zdCwgMiksXG4gICAgJ21lbWJlcl9jb3VudCcsIG1lbWJlcl9jb3VudCxcbiAgICAnY2xhaW1fY291bnQnLCBjbGFpbV9jb3VudCxcbiAgICAnZ3Jvc3Nfc2F2aW5ncycsIFJPVU5EKGdyb3NzX3NhdmluZ3MsIDIpXG4gIClcbikgQVMgZXhjbHVzaW9uX3N1bW1hcnlcbkZST00gZmluYWxfZGF0YTtcbiAgYDtcblxuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNsaWVudC5xdWVyeShxdWVyeSwgW2ZpbGVJZF0pO1xuICAgIHJldHVybiByZXN1bHQucm93c1swXT8uZXhjbHVzaW9uX3N1bW1hcnkgfHwgbnVsbDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBkdXJpbmcgQ29udHJhY3QgU2F2aW5ncyBhbmFseXNpczonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuLyoqXG4gKiBTYXZlIGFuYWx5c2lzIHJlc3VsdHMgdG8gdGhlIHNhdmluZ3NfcmVzdWx0cyB0YWJsZVxuICovXG5hc3luYyBmdW5jdGlvbiBzYXZlUmVzdWx0c1RvRGF0YWJhc2UoY2xpZW50OiBDbGllbnQsIGZpbGVJZDogc3RyaW5nLCBjYXRlZ29yeTogc3RyaW5nLCByZXN1bHRzOiBhbnkpIHtcbiAgdHJ5IHtcbiAgICAvLyBHZW5lcmF0ZSBhIG5ldyBVVUlEIGZvciB0aGlzIHJlc3VsdFxuICAgIGNvbnN0IHJlc3VsdElkID0gdXVpZHY0KCk7XG4gICAgXG4gICAgLy8gR2V0IHVzZXIgaW5mbyBmb3IgY3JlYXRlZF9ieSBmaWVsZFxuICAgIGNvbnN0IGNyZWF0ZWRCeSA9ICdsYW1iZGEtY29udHJhY3Qtc2F2aW5ncy1wcm9jZXNzb3InO1xuICAgIFxuICAgIC8vIEZpcnN0LCBkZWxldGUgYW55IGV4aXN0aW5nIHJlY29yZHMgZm9yIHRoaXMgZmlsZSBhbmQgY2F0ZWdvcnlcbiAgICB0cnkge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KGBcbiAgICAgICAgREVMRVRFIEZST00gc2F2aW5nc19yZXN1bHRzIFxuICAgICAgICBXSEVSRSBmaWxlX2lkID0gJDEgQU5EIGNhdGVnb3J5ID0gJDJcbiAgICAgIGAsIFtmaWxlSWQsIGNhdGVnb3J5XSk7XG4gICAgfSBjYXRjaCAoZGVsZXRlRXJyb3IpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdObyBleGlzdGluZyByZWNvcmRzIHRvIGRlbGV0ZSBvciBlcnJvciBkdXJpbmcgZGVsZXRpb246JywgZGVsZXRlRXJyb3IpO1xuICAgICAgLy8gQ29udGludWUgd2l0aCBpbnNlcnQgZXZlbiBpZiBkZWxldGUgZmFpbHNcbiAgICB9XG5cbiAgICAvLyBJbnNlcnQgcXVlcnkgdG8gc2F2ZSByZXN1bHRzXG4gICAgY29uc3QgaW5zZXJ0UXVlcnkgPSBgXG4gICAgICBJTlNFUlQgSU5UTyBzYXZpbmdzX3Jlc3VsdHMgKFxuICAgICAgICBpZCwgXG4gICAgICAgIGZpbGVfaWQsIFxuICAgICAgICBjYXRlZ29yeSwgXG4gICAgICAgIHJlc3VsdHMsIFxuICAgICAgICBjcmVhdGVkX2F0LCBcbiAgICAgICAgY3JlYXRlZF9ieVxuICAgICAgKSBWQUxVRVMgKFxuICAgICAgICAkMSwgJDIsICQzLCAkNCwgQ1VSUkVOVF9USU1FU1RBTVAsICQ1XG4gICAgICApXG4gICAgYDtcbiAgICBcbiAgICAvLyBFeGVjdXRlIHF1ZXJ5IHdpdGggcGFyYW1ldGVyc1xuICAgIGF3YWl0IGNsaWVudC5xdWVyeShpbnNlcnRRdWVyeSwgW1xuICAgICAgcmVzdWx0SWQsXG4gICAgICBmaWxlSWQsXG4gICAgICBjYXRlZ29yeSxcbiAgICAgIEpTT04uc3RyaW5naWZ5KHJlc3VsdHMpLFxuICAgICAgY3JlYXRlZEJ5XG4gICAgXSk7XG4gICAgXG4gICAgY29uc29sZS5sb2coYFJlc3VsdHMgc2F2ZWQgdG8gc2F2aW5nc19yZXN1bHRzIHRhYmxlIGZvciBmaWxlICR7ZmlsZUlkfSwgY2F0ZWdvcnk6ICR7Y2F0ZWdvcnl9YCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIHJlc3VsdHMgdG8gZGF0YWJhc2U6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59Il19