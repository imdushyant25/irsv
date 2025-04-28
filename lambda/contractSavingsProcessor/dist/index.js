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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsaURBQWlEOzs7QUFFakQsMkJBQTRCO0FBQzVCLCtCQUFvQztBQUVwQyxNQUFNLFFBQVEsR0FBRztJQUNmLElBQUksRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU87SUFDekIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sSUFBSSxNQUFNLENBQUM7SUFDN0MsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTztJQUM3QixJQUFJLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPO0lBQ3pCLFFBQVEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVc7SUFDakMsR0FBRyxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFO0lBQ2xDLHVCQUF1QixFQUFFLEtBQUs7SUFDOUIsaUJBQWlCLEVBQUUsTUFBTSxFQUFPLFlBQVk7SUFDNUMsYUFBYSxFQUFFLE1BQU0sRUFBVyxZQUFZO0lBQzVDLG1DQUFtQyxFQUFFLE1BQU07Q0FDNUMsQ0FBQztBQUVLLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxLQUFVLEVBQUUsRUFBRTtJQUMxQyxPQUFPLENBQUMsR0FBRyxDQUFDLGdEQUFnRCxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUVyRixNQUFNLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxHQUFHLEtBQUssQ0FBQztJQUV4QyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDOUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxxRUFBcUUsQ0FBQyxDQUFDO0lBQ3pGLENBQUM7SUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLFdBQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUVwQyxJQUFJLENBQUM7UUFDSCxNQUFN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OztLQVduQixDQUFDO1FBRUYsZ0NBQWdDO1FBQ2hDLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUU7WUFDOUIsUUFBUTtZQUNSLE1BQU07WUFDTixRQUFRO1lBQ1IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUM7WUFDdkIsU0FBUztTQUNWLENBQUMsQ0FBQztRQUVILE9BQU8sQ0FBQyxHQUFHLENBQUMsbURBQW1ELE1BQU0sZUFBZSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ2xHLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxtQ0FBbUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMxRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gRmlsZTogbGFtYmRhL2NvbnRyYWN0U2F2aW5nc1Byb2Nlc3Nvci9pbmRleC50c1xuXG5pbXBvcnQgeyBDbGllbnQgfSBmcm9tICdwZyc7XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcblxuY29uc3QgZGJDb25maWcgPSB7XG4gIGhvc3Q6IHByb2Nlc3MuZW52LkRCX0hPU1QsXG4gIHBvcnQ6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPUlQgfHwgJzU0MzInKSxcbiAgZGF0YWJhc2U6IHByb2Nlc3MuZW52LkRCX05BTUUsXG4gIHVzZXI6IHByb2Nlc3MuZW52LkRCX1VTRVIsXG4gIHBhc3N3b3JkOiBwcm9jZXNzLmVudi5EQl9QQVNTV09SRCxcbiAgc3NsOiB7IHJlamVjdFVuYXV0aG9yaXplZDogZmFsc2UgfSxcbiAgY29ubmVjdGlvblRpbWVvdXRNaWxsaXM6IDMwMDAwLFxuICBzdGF0ZW1lbnRfdGltZW91dDogMzAwMDAwLCAgICAgIC8vIDUgbWludXRlc1xuICBxdWVyeV90aW1lb3V0OiAzMDAwMDAsICAgICAgICAgIC8vIDUgbWludXRlc1xuICBpZGxlX2luX3RyYW5zYWN0aW9uX3Nlc3Npb25fdGltZW91dDogMzAwMDAwXG59O1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogYW55KSA9PiB7XG4gIGNvbnNvbGUubG9nKCdTdGFydGluZyBDb250cmFjdCBTYXZpbmdzIGFuYWx5c2lzIHdpdGggZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQpKTtcblxuICBjb25zdCB7IGZpbGVJZCwgb3Bwb3J0dW5pdHlJZCB9ID0gZXZlbnQ7XG5cbiAgaWYgKCFmaWxlSWQgfHwgIW9wcG9ydHVuaXR5SWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgcmVxdWlyZWQgcGFyYW1ldGVyczogZmlsZUlkIGFuZCBvcHBvcnR1bml0eUlkIGFyZSByZXF1aXJlZC4nKTtcbiAgfVxuXG4gIGNvbnN0IGNsaWVudCA9IG5ldyBDbGllbnQoZGJDb25maWcpO1xuXG4gIHRyeSB7XG4gICAgYXdhaXQgY2xpZW50LmNvbm5lY3QoKTtcbiAgICBpZiAocHJvY2Vzcy5lbnYuREJfU0NIRU1BKSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoYFNFVCBzZWFyY2hfcGF0aCBUTyAke3Byb2Nlc3MuZW52LkRCX1NDSEVNQX1gKTtcbiAgICB9XG5cbiAgICAvLyBTdGVwIDE6IFJ1biB0aGUgQ29udHJhY3QgU2F2aW5ncyBhbmFseXNpc1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFuYWx5emVDb250cmFjdFNhdmluZ3MoY2xpZW50LCBmaWxlSWQpO1xuICAgIFxuICAgIC8vIFN0ZXAgMjogU2F2ZSByZXN1bHRzIHRvIHNhdmluZ3NfcmVzdWx0cyB0YWJsZSB3aXRoIGNhdGVnb3J5IFwiY29udHJhY3RTYXZpbmdzXCJcbiAgICBhd2FpdCBzYXZlUmVzdWx0c1RvRGF0YWJhc2UoY2xpZW50LCBmaWxlSWQsICdjb250cmFjdFNhdmluZ3MnLCByZXN1bHQpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGJvZHk6IHtcbiAgICAgICAgbWVzc2FnZTogJ0NvbnRyYWN0IFNhdmluZ3MgYW5hbHlzaXMgY29tcGxldGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgIGZpbGVJZCxcbiAgICAgICAgb3Bwb3J0dW5pdHlJZCxcbiAgICAgICAgcmVzdWx0XG4gICAgICB9XG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBkdXJpbmcgQ29udHJhY3QgU2F2aW5ncyBhbmFseXNpczonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IHtcbiAgICAgICAgbWVzc2FnZTogJ0NvbnRyYWN0IFNhdmluZ3MgYW5hbHlzaXMgZmFpbGVkJyxcbiAgICAgICAgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKVxuICAgICAgfVxuICAgIH07XG4gIH0gZmluYWxseSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGNsaWVudC5lbmQoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjbG9zaW5nIGNsaWVudDonLCBlKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogQW5hbHl6ZSBjb250cmFjdCBzYXZpbmdzIGJhc2VkIG9uIGV4Y2x1c2lvbiB0eXBlc1xuICovXG5hc3luYyBmdW5jdGlvbiBhbmFseXplQ29udHJhY3RTYXZpbmdzKGNsaWVudDogQ2xpZW50LCBmaWxlSWQ6IHN0cmluZykge1xuICBjb25zdCBxdWVyeSA9IGBcbiAgV0lUSCBjbGFpbV9kYXRhIEFTIChcbiAgU0VMRUNUXG4gICAgQ0FTRSBcbiAgICAgIFdIRU4gY3IuZXhjbHVzaW9uX3R5cGUgSVMgTlVMTCBUSEVOICdSZXByaWNlJ1xuICAgICAgRUxTRSBjci5leGNsdXNpb25fdHlwZVxuICAgIEVORCBBUyBleGNsdXNpb25fdHlwZSxcblxuICAgIENBU0VcbiAgICAgIFdIRU4gY3IubG9va3VwX2ZpZWxkcy0+PidpbmN1bWJlbnRfcmViYXRlX3R5cGUnID0gJ25vUmViYXRlcycgVEhFTiBcbiAgICAgICAgQ09BTEVTQ0UoKGNyLm1hcHBlZF9maWVsZHMtPj4ncGxhbl9jb3N0Jyk6Om51bWVyaWMsIDApXG4gICAgICBFTFNFIFxuICAgICAgICBDT0FMRVNDRSgoY3IubWFwcGVkX2ZpZWxkcy0+PidwbGFuX2Nvc3QnKTo6bnVtZXJpYywgMCkgLVxuICAgICAgICBDT0FMRVNDRSgoY3IubG9va3VwX2ZpZWxkcy0+PidpbmN1bWJlbnRfcmViYXRlJyk6Om51bWVyaWMsIDApXG4gICAgRU5EIEFTIGluY3VtYmVudF9wbGFuX2Nvc3QsXG5cbiAgICBDQVNFXG4gICAgICBXSEVOIExFRlQoY3IubG9va3VwX2ZpZWxkcy0+Pidicm5kX2ducmMnLCAxKSA9ICdCJyBUSEVOXG4gICAgICAgIENPQUxFU0NFKChjci5sb29rdXBfZmllbGRzLT4+J3JlcHJpY2VfcGxhbl9jb3N0Jyk6Om51bWVyaWMsIDApXG4gICAgICBFTFNFXG4gICAgICAgIENPQUxFU0NFKChjci5sb29rdXBfZmllbGRzLT4+J3JlcHJpY2VfbmV0X3BsYW5fY29zdCcpOjpudW1lcmljLCAwKVxuICAgIEVORCBBUyBpbGx1bWluYXRlX3BsYW5fY29zdCxcblxuICAgIGNyLm1hcHBlZF9maWVsZHMtPj4nbWVtYmVyX2lkJyBBUyBtZW1iZXJfaWRcblxuICBGUk9NIGVkcG0uY2xhaW1fcmVjb3JkcyBjclxuICBXSEVSRSBjci5maWxlX2lkID0gJDFcbiAgICBBTkQgY3IubG9va3VwX2ZpZWxkcy0+Pidpc19pbl9mb3JtdWxhcnknID0gJ3RydWUnXG4gICAgQU5EIENPQUxFU0NFKGNyLmV4Y2x1c2lvbl90eXBlLCAnJykgTk9UIElOICgnUGxhbicsICdFX1FMJylcbiksXG5ncm91cGVkIEFTIChcbiAgU0VMRUNUXG4gICAgQ0FTRVxuICAgICAgV0hFTiBleGNsdXNpb25fdHlwZSA9ICdBX0dMUDFfV0wnIFRIRU4gJ0dMUC0xIFdlaWdodCBMb3NzJ1xuICAgICAgV0hFTiBleGNsdXNpb25fdHlwZSA9ICdCX0dMUDFfREInIFRIRU4gJ0dMUC0xIERpYWJldGVzJ1xuICAgICAgV0hFTiBleGNsdXNpb25fdHlwZSA9ICdDX0hEQ1InICAgICBUSEVOICdIRENSJ1xuICAgICAgV0hFTiBleGNsdXNpb25fdHlwZSA9ICdEX1BBJyAgICAgICBUSEVOICdQcmlvciBBdXRoJ1xuICAgICAgV0hFTiBleGNsdXNpb25fdHlwZSA9ICdFX1FMJyAgICAgICBUSEVOICdRdWFudGl0eSBMaW1pdHMnXG4gICAgICBFTFNFIGV4Y2x1c2lvbl90eXBlXG4gICAgRU5EIEFTIGV4Y2x1c2lvbl90eXBlLFxuXG4gICAgUk9VTkQoU1VNKGluY3VtYmVudF9wbGFuX2Nvc3QpLCAyKSBBUyBpbmN1bWJlbnRfcGxhbl9jb3N0LFxuICAgIFJPVU5EKFNVTShpbGx1bWluYXRlX3BsYW5fY29zdCksIDIpIEFTIGlsbHVtaW5hdGVfcGxhbl9jb3N0LFxuICAgIENPVU5UKERJU1RJTkNUIG1lbWJlcl9pZCkgQVMgbWVtYmVyX2NvdW50LFxuICAgIENPVU5UKCopIEFTIGNsYWltX2NvdW50LFxuICAgIFJPVU5EKChTVU0oaW5jdW1iZW50X3BsYW5fY29zdCkgLSBTVU0oaWxsdW1pbmF0ZV9wbGFuX2Nvc3QpKSAqIDAuNjUsIDIpIEFTIGdyb3NzX3NhdmluZ3NcbiAgRlJPTSBjbGFpbV9kYXRhXG4gIEdST1VQIEJZIGV4Y2x1c2lvbl90eXBlXG4pXG5TRUxFQ1QganNvbl9hZ2cocmVzdWx0KSBBUyBleGNsdXNpb25fc3VtbWFyeVxuRlJPTSBncm91cGVkIHJlc3VsdDtcbiAgYDtcblxuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNsaWVudC5xdWVyeShxdWVyeSwgW2ZpbGVJZF0pO1xuICAgIHJldHVybiByZXN1bHQucm93c1swXT8uZXhjbHVzaW9uX3N1bW1hcnkgfHwgbnVsbDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBkdXJpbmcgQ29udHJhY3QgU2F2aW5ncyBhbmFseXNpczonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuLyoqXG4gKiBTYXZlIGFuYWx5c2lzIHJlc3VsdHMgdG8gdGhlIHNhdmluZ3NfcmVzdWx0cyB0YWJsZVxuICovXG5hc3luYyBmdW5jdGlvbiBzYXZlUmVzdWx0c1RvRGF0YWJhc2UoY2xpZW50OiBDbGllbnQsIGZpbGVJZDogc3RyaW5nLCBjYXRlZ29yeTogc3RyaW5nLCByZXN1bHRzOiBhbnkpIHtcbiAgdHJ5IHtcbiAgICAvLyBHZW5lcmF0ZSBhIG5ldyBVVUlEIGZvciB0aGlzIHJlc3VsdFxuICAgIGNvbnN0IHJlc3VsdElkID0gdXVpZHY0KCk7XG4gICAgXG4gICAgLy8gR2V0IHVzZXIgaW5mbyBmb3IgY3JlYXRlZF9ieSBmaWVsZFxuICAgIGNvbnN0IGNyZWF0ZWRCeSA9ICdsYW1iZGEtY29udHJhY3Qtc2F2aW5ncy1wcm9jZXNzb3InO1xuICAgIFxuICAgIC8vIEZpcnN0LCBkZWxldGUgYW55IGV4aXN0aW5nIHJlY29yZHMgZm9yIHRoaXMgZmlsZSBhbmQgY2F0ZWdvcnlcbiAgICB0cnkge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KGBcbiAgICAgICAgREVMRVRFIEZST00gc2F2aW5nc19yZXN1bHRzIFxuICAgICAgICBXSEVSRSBmaWxlX2lkID0gJDEgQU5EIGNhdGVnb3J5ID0gJDJcbiAgICAgIGAsIFtmaWxlSWQsIGNhdGVnb3J5XSk7XG4gICAgfSBjYXRjaCAoZGVsZXRlRXJyb3IpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdObyBleGlzdGluZyByZWNvcmRzIHRvIGRlbGV0ZSBvciBlcnJvciBkdXJpbmcgZGVsZXRpb246JywgZGVsZXRlRXJyb3IpO1xuICAgICAgLy8gQ29udGludWUgd2l0aCBpbnNlcnQgZXZlbiBpZiBkZWxldGUgZmFpbHNcbiAgICB9XG5cbiAgICAvLyBJbnNlcnQgcXVlcnkgdG8gc2F2ZSByZXN1bHRzXG4gICAgY29uc3QgaW5zZXJ0UXVlcnkgPSBgXG4gICAgICBJTlNFUlQgSU5UTyBzYXZpbmdzX3Jlc3VsdHMgKFxuICAgICAgICBpZCwgXG4gICAgICAgIGZpbGVfaWQsIFxuICAgICAgICBjYXRlZ29yeSwgXG4gICAgICAgIHJlc3VsdHMsIFxuICAgICAgICBjcmVhdGVkX2F0LCBcbiAgICAgICAgY3JlYXRlZF9ieVxuICAgICAgKSBWQUxVRVMgKFxuICAgICAgICAkMSwgJDIsICQzLCAkNCwgQ1VSUkVOVF9USU1FU1RBTVAsICQ1XG4gICAgICApXG4gICAgYDtcbiAgICBcbiAgICAvLyBFeGVjdXRlIHF1ZXJ5IHdpdGggcGFyYW1ldGVyc1xuICAgIGF3YWl0IGNsaWVudC5xdWVyeShpbnNlcnRRdWVyeSwgW1xuICAgICAgcmVzdWx0SWQsXG4gICAgICBmaWxlSWQsXG4gICAgICBjYXRlZ29yeSxcbiAgICAgIEpTT04uc3RyaW5naWZ5KHJlc3VsdHMpLFxuICAgICAgY3JlYXRlZEJ5XG4gICAgXSk7XG4gICAgXG4gICAgY29uc29sZS5sb2coYFJlc3VsdHMgc2F2ZWQgdG8gc2F2aW5nc19yZXN1bHRzIHRhYmxlIGZvciBmaWxlICR7ZmlsZUlkfSwgY2F0ZWdvcnk6ICR7Y2F0ZWdvcnl9YCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIHJlc3VsdHMgdG8gZGF0YWJhc2U6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59Il19