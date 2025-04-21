// File: lambda/rebateProcessor/index.ts

import { Client } from 'pg';

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
  console.log('Starting Rebate processing with event:', JSON.stringify(event));

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

    // Process and update incumbent rebates for all claims
    const updatedCount = await processIncumbentRebates(client, fileId);

    return {
      statusCode: 200,
      body: {
        message: 'Rebate processing completed successfully',
        fileId,
        opportunityId,
        updatedClaimsCount: updatedCount
      }
    };
  } catch (error) {
    console.error('Error during rebate processing:', error);
    return {
      statusCode: 500,
      body: {
        message: 'Rebate processing failed',
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
 * Process and update incumbent rebates for all claims based on opportunity configuration
 */
async function processIncumbentRebates(client: Client, fileId: string) {
  const query = `
    WITH file_opportunity AS (
        SELECT 
            cfr.file_id,
            o.opportunity_metadata->'generalInformation'->'rebates'->'incumbent' AS incumbent_rebate_config
        FROM claims_file_registry cfr
        JOIN opportunity o ON o.opportunity_id = cfr.opportunity_id
        WHERE cfr.file_id = $1
        LIMIT 1
    ),

    claim_counts AS (
        SELECT 
            COUNT(*) FILTER (
                WHERE cr.lookup_fields->>'specialty_indicator' = 'Y' 
                  AND cr.lookup_fields->>'brnd_gnrc' LIKE 'B%'
            ) AS specialty_claims,
            
            COUNT(*) FILTER (
                WHERE (cr.lookup_fields->>'specialty_indicator' IS DISTINCT FROM 'Y') 
                  AND cr.lookup_fields->>'brnd_gnrc' LIKE 'B%'
            ) AS nonspecialty_claims
        FROM claim_records cr
        WHERE cr.file_id = $1
    ),

    rebate_data AS (
        SELECT 
            fc.file_id,
            (ir->>'type') AS rebate_type,
            (ir->'lumpSumRebates'->>'amount')::numeric AS lump_sum_amount,
            (ir->'lumpSumRebates'->>'specialtyBrandPercentage')::numeric AS lump_sum_spec_pct,
            (ir->'lumpSumRebates'->>'nonSpecialtyBrandPercentage')::numeric AS lump_sum_nonspec_pct,
            (ir->'perClaimRebates'->>'specialtyBrand')::numeric AS perclaim_spec,
            (ir->'perClaimRebates'->>'nonSpecialtyBrand30DS')::numeric AS perclaim_ns_30,
            (ir->'perClaimRebates'->>'nonSpecialtyBrand90DS')::numeric AS perclaim_ns_90,
            cc.specialty_claims,
            cc.nonspecialty_claims
        FROM file_opportunity fc,
             LATERAL (SELECT fc.incumbent_rebate_config AS ir) sub,
             claim_counts cc
    )

    -- Final update
    UPDATE claim_records cr
    SET lookup_fields = lookup_fields || jsonb_build_object(
        'incumbent_rebate',
        CASE 
            -- noRebates → 0
            WHEN rd.rebate_type = 'noRebates' THEN 0

            -- useFromClaims → mapped_fields.rebate_value
            WHEN rd.rebate_type = 'useFromClaims' THEN
                COALESCE(NULLIF(cr.mapped_fields->>'rebate_value', '')::numeric, 0)

            -- perClaim logic
            WHEN rd.rebate_type = 'perClaim' THEN
                CASE 
                    WHEN cr.lookup_fields->>'specialty_indicator' = 'Y' 
                         AND cr.lookup_fields->>'brnd_gnrc' LIKE 'B%' THEN rd.perclaim_spec
                    WHEN cr.lookup_fields->>'specialty_indicator' <> 'Y' 
                         AND cr.lookup_fields->>'brnd_gnrc' LIKE 'B%' 
                         AND (cr.lookup_fields->>'days_supply')::numeric <= 30 THEN rd.perclaim_ns_30
                    WHEN cr.lookup_fields->>'specialty_indicator' <> 'Y' 
                         AND cr.lookup_fields->>'brnd_gnrc' LIKE 'B%' 
                         AND (cr.lookup_fields->>'days_supply')::numeric > 30 THEN rd.perclaim_ns_90
                    ELSE 0
                END

            -- lumpSum logic
            WHEN rd.rebate_type = 'lumpSum' THEN
                CASE 
                    WHEN cr.lookup_fields->>'specialty_indicator' = 'Y' 
                         AND cr.lookup_fields->>'brnd_gnrc' LIKE 'B%' AND rd.specialty_claims > 0 THEN 
                        ROUND((rd.lump_sum_amount * rd.lump_sum_spec_pct / 100.0) / rd.specialty_claims, 2)
                    WHEN cr.lookup_fields->>'specialty_indicator' <> 'Y' 
                         AND cr.lookup_fields->>'brnd_gnrc' LIKE 'B%' AND rd.nonspecialty_claims > 0 THEN 
                        ROUND((rd.lump_sum_amount * rd.lump_sum_nonspec_pct / 100.0) / rd.nonspecialty_claims, 2)
                    ELSE 0
                END

            -- fallback
            ELSE 0
        END
    )
    FROM rebate_data rd
    WHERE cr.file_id = rd.file_id
  `;

  try {
    const result = await client.query(query, [fileId]);
    console.log(`Updated ${result.rowCount} claim records with incumbent rebate values`);
    return result.rowCount;
  } catch (error) {
    console.error('Error updating incumbent rebates:', error);
    throw error;
  }
}