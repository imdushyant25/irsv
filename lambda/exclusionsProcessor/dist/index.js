"use strict";
// File: lambda/exclusionsProcessor/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const pg_1 = require("pg");
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
const handler = async (event) => {
    console.log('Starting exclusions analysis with event:', JSON.stringify(event));
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
        const result = await analyzeExclusions(client, fileId, opportunityId);
        await stampExcludedClaims(client, fileId, opportunityId);
        return {
            statusCode: 200,
            body: {
                message: 'Exclusions analysis completed successfully',
                fileId,
                opportunityId,
                result
            }
        };
    }
    catch (error) {
        console.error('Error during exclusions analysis:', error);
        return {
            statusCode: 500,
            body: {
                message: 'Exclusions analysis failed',
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
async function analyzeExclusions(client, fileId, opportunityId) {
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
      UNION
      SELECT DISTINCT REPLACE(key, 'fl_', '') AS exclusion_name, 'Drug' AS exclusion_type
      FROM file_claims, jsonb_each_text(lookup_fields)
      WHERE key LIKE 'fl_%' AND value = 'true'
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
    drug_flag_claims_raw AS (
      SELECT DISTINCT
        'Drug' AS exclusion_type,
        REPLACE(key, 'fl_', '') AS exclusion_name,
        fc.plan_cost,
        fc.member_id,
        fc.record_id
      FROM file_claims fc,
           jsonb_each_text(fc.lookup_fields) AS kv(key, value)
      WHERE key LIKE 'fl_%'
        AND value = 'true'
        AND fc.lookup_fields ? REPLACE(key, 'fl_', '')
        AND fc.lookup_fields->>REPLACE(key, 'fl_', '') = 'Y'
    
    ),
    filtered_drug_flag_claims AS (
      SELECT df.*
      FROM drug_flag_claims_raw df
      LEFT JOIN plan_exclusion_claims pe ON df.record_id = pe.record_id
      WHERE pe.record_id IS NULL
    ),
    all_exclusions AS (
      SELECT * FROM plan_exclusion_claims
      UNION ALL
      SELECT * FROM filtered_drug_flag_claims
    ),
    grouped AS (
      SELECT
        exclusion_type,
        exclusion_name,
        SUM(plan_cost) AS total_plan_cost,
        COUNT(*) AS claim_count,
        COUNT(DISTINCT member_id) AS member_count
      FROM all_exclusions
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
async function stampExcludedClaims(client, fileId, opportunityId) {
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
    ),
    drug_flag_claims_raw AS (
      SELECT DISTINCT
        fc.record_id::uuid AS record_id,
        'Drug' AS exclusion_type
      FROM file_claims fc,
           jsonb_each_text(fc.lookup_fields) AS kv(key, value)
      WHERE key LIKE 'fl_%'
        AND value = 'true'
        AND fc.lookup_fields ? REPLACE(key, 'fl_', '')
        AND fc.lookup_fields->>REPLACE(key, 'fl_', '') = 'Y'
    ),
    filtered_drug_flag_claims AS (
      SELECT df.*
      FROM drug_flag_claims_raw df
      LEFT JOIN plan_exclusion_claims pe ON df.record_id = pe.record_id
      WHERE pe.record_id IS NULL
    ),
    all_to_stamp AS (
      SELECT * FROM plan_exclusion_claims
      UNION ALL
      SELECT * FROM filtered_drug_flag_claims
    )

    UPDATE edpm.claim_records cr
    SET lookup_fields = cr.lookup_fields || jsonb_build_object(
      'Exclusion', 'Y',
      'Exclusion Type', ats.exclusion_type
    )
    FROM all_to_stamp ats
    WHERE cr.record_id = ats.record_id;
  `;
    await client.query(updateQuery, [opportunityId, fileId]);
}
//# sourceMappingURL=index.js.map