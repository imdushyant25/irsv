// File: lambda/formularyExclusionsProcessor/index.ts

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
  statement_timeout: 300000,      // Increase to 5 minutes
  query_timeout: 300000,          // Increase to 5 minutes
  idle_in_transaction_session_timeout: 300000
};

export const handler = async (event: any) => {
  console.log('Starting formulary exclusions analysis with event:', JSON.stringify(event));

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

    // Step 1: Run the formulary exclusions analysis
    const result = await analyzeFormularyExclusions(client, fileId);
    
    // Step 2: Update claim records with formulary_disruption flag
    await updateFormularyDisruptions(client, fileId);
    
    // Step 3: Save results to savings_results table with category "formulary"
    await saveResultsToDatabase(client, fileId, 'formulary', result);

    return {
      statusCode: 200,
      body: {
        message: 'Formulary exclusions analysis completed successfully',
        fileId,
        opportunityId,
        result
      }
    };
  } catch (error) {
    console.error('Error during formulary exclusions analysis:', error);
    return {
      statusCode: 500,
      body: {
        message: 'Formulary exclusions analysis failed',
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
 * Analyze formulary exclusions based on the claims data
 */
async function analyzeFormularyExclusions(client: Client, fileId: string) {
  const query = `
  with non_formulary_claims as (
select
	cr.record_id,
	cr.file_id,
	cr.lookup_fields,
	cr.mapped_fields,
	LPAD(TRIM(cr.lookup_fields->>'ndc11'), 11, '0') as ndc11,
	left(mi.gpi14, 6) as gpi6,
	left(mi.gpi14, 4) as gpi4,
	left(mi.gpi14, 2) as gpi2,
	cr.lookup_fields->>'formulary' as formulary,
	cr.lookup_fields->>'specialty_indicator' as claim_specialty_indicator,
	cr.lookup_fields->>'brnd_gnrc' as claim_brnd_gnrc,
	(cr.lookup_fields->>'days_supply')::numeric as days_supply,
	(cr.lookup_fields->>'member_copay')::numeric as member_copay,
	(cr.mapped_fields->>'plan_cost')::numeric as plan_cost,
	(cr.lookup_fields->>'incumbent_rebate')::numeric as incumbent_rebate,
	cr.mapped_fields->>'member_id' as member_id
from
	claim_records cr
join mspan_ndc_info mi on
	cr.lookup_fields->>'ndc11' = mi.ndc11
where
	cr.file_id = $1
	and cr.lookup_fields->>'is_in_formulary' = 'false'
	and cr.exclusion_type is NULL),
formulary_gpis as (
select
	distinct left(dm.gpi14, 6) as gpi6,
	left(dm.gpi14, 4) as gpi4,
	left(dm.gpi14, 2) as gpi2
from
	drugs_master dm,
	(
	select
		distinct formulary
	from
		non_formulary_claims) f
where
	(f.formulary ILIKE '%Closed%'
		and dm.is_closed_formulary = 'Y')
	or (f.formulary ILIKE '%Open%'
		and dm.is_open_formulary = 'Y')),
matched_gpi6 as (
select
	'gpi6' as gpi_type,
	gpi6 as matched_gpi_value,
	nfc.*
from
	non_formulary_claims nfc
where
	gpi6 in (
	select
		gpi6
	from
		formulary_gpis)),
matched_gpi4 as (
select
	'gpi4' as gpi_type,
	gpi4 as matched_gpi_value,
	nfc.*
from
	non_formulary_claims nfc
where
	gpi4 in (
	select
		gpi4
	from
		formulary_gpis)
	and record_id not in (
	select
		record_id
	from
		matched_gpi6)),
matched_gpi2 as (
select
	'gpi2' as gpi_type,
	gpi2 as matched_gpi_value,
	nfc.*
from
	non_formulary_claims nfc
where
	gpi2 in (
	select
		gpi2
	from
		formulary_gpis)
	and record_id not in (
	select
		record_id
	from
		matched_gpi6
union all
	select
		record_id
	from
		matched_gpi4 )),
drug_matches_gpi6 as (
select
	m.record_id,
	m.member_id,
	m.gpi_type,
	m.claim_specialty_indicator,
	m.claim_brnd_gnrc,
	m.days_supply,
	m.member_copay,
	m.plan_cost,
	m.incumbent_rebate,
	dm.brnd_gnrc as matched_brnd_gnrc,
	dm.gpi6_awp_per_ds as awp_per_ds,
	dm.gpi6_avg_disc as avg_disc,
	dm.gpi6_rebate_yield as rebate_yield
from
	matched_gpi6 m
join drugs_master dm on
	m.gpi6 = dm.gpi6
	and coalesce(m.claim_specialty_indicator, 'N') = coalesce(dm.specialty_indicator, 'N')),
drug_matches_gpi4 as (
select
	m.record_id,
	m.member_id,
	m.gpi_type,
	m.claim_specialty_indicator,
	m.claim_brnd_gnrc,
	m.days_supply,
	m.member_copay,
	m.plan_cost,
	m.incumbent_rebate,
	dm.brnd_gnrc as matched_brnd_gnrc,
	dm.gpi4_awp_per_ds as awp_per_ds,
	dm.gpi4_avg_disc as avg_disc,
	dm.gpi4_rebate_yield as rebate_yield
from
	matched_gpi4 m
join drugs_master dm on
	m.gpi4 = dm.gpi4
	and coalesce(m.claim_specialty_indicator, 'N') = coalesce(dm.specialty_indicator, 'N')),
drug_matches_gpi2 as (
select
	m.record_id,
	m.member_id,
	m.gpi_type,
	m.claim_specialty_indicator,
	m.claim_brnd_gnrc,
	m.days_supply,
	m.member_copay,
	m.plan_cost,
	m.incumbent_rebate,
	dm.brnd_gnrc as matched_brnd_gnrc,
	dm.gpi2_awp_per_ds as awp_per_ds,
	dm.gpi2_avg_disc as avg_disc,
	dm.gpi2_rebate_yield as rebate_yield
from
	matched_gpi2 m
join drugs_master dm on
	m.gpi2 = dm.gpi2
	and coalesce(m.claim_specialty_indicator, 'N') = coalesce(dm.specialty_indicator, 'N')),
drug_matches as (
select
	*
from
	drug_matches_gpi6
union all
select
	*
from
	drug_matches_gpi4
union all
select
	*
from
	drug_matches_gpi2),
cost_components as (
select
	record_id,
	member_id,
	claim_specialty_indicator,
	days_supply,
	member_copay,
	plan_cost,
	incumbent_rebate,
	matched_brnd_gnrc,
	awp_per_ds,
	case
		when claim_specialty_indicator = 'N'
			and matched_brnd_gnrc like 'B%' then 0.2044
			when claim_specialty_indicator = 'N'
			and matched_brnd_gnrc like 'G%' then 0.8739
			when claim_specialty_indicator = 'Y' then coalesce(avg_disc, 0)
			else 0
		end as used_avg_disc,
		coalesce(rebate_yield, 0) as used_rebate_yield
	from
		drug_matches),
pivoted_costs as (
select
	record_id,
	member_id,
	claim_specialty_indicator,
	days_supply,
	member_copay,
	plan_cost,
	incumbent_rebate,
	MAX(case when matched_brnd_gnrc like 'B%' then awp_per_ds end) as brand_awp_per_ds,
	MAX(case when matched_brnd_gnrc like 'B%' then used_avg_disc end) as brand_used_discount,
	MAX(case when matched_brnd_gnrc like 'B%' then used_rebate_yield end) as brand_rebate_yield,
	MAX(case when matched_brnd_gnrc like 'G%' then awp_per_ds end) as generic_awp_per_ds,
	MAX(case when matched_brnd_gnrc like 'G%' then used_avg_disc end) as generic_used_discount,
	MAX(case when matched_brnd_gnrc like 'G%' then used_rebate_yield end) as generic_rebate_yield,
	MAX(case when matched_brnd_gnrc like 'B%' then ((awp_per_ds * (1 - used_avg_disc) * days_supply - member_copay) - (awp_per_ds * days_supply * used_rebate_yield)) end) as brand_net_cost,
	MAX(case when matched_brnd_gnrc like 'G%' then ((awp_per_ds * (1 - used_avg_disc) * days_supply - member_copay)) end) as generic_net_cost
from
	cost_components
group by
	record_id,
	member_id,
	claim_specialty_indicator,
	days_supply,
	member_copay,
	plan_cost,
	incumbent_rebate),
claim_final as (
select
	record_id,
	member_id,
	claim_specialty_indicator,
	(plan_cost - incumbent_rebate) as incumbent_plan_cost,
	ROUND( (coalesce(brand_net_cost, 0) + GREATEST(coalesce(generic_net_cost, 0), 0)) / 2, 2) as illuminate_plan_cost
from
	pivoted_costs),
category_summary as (
select
	case
		when claim_specialty_indicator = 'Y' then 'Specialty'
		else 'Non-Specialty'
	end as category,
	SUM(incumbent_plan_cost) as incumbent_plan_cost,
	SUM(illuminate_plan_cost) as illuminate_plan_cost,
	COUNT(*) as claim_count,
	COUNT(distinct member_id) as member_count
from
	claim_final
group by
	category),
total_summary as (
select
	'Total' as category,
	SUM(incumbent_plan_cost) as incumbent_plan_cost,
	SUM(illuminate_plan_cost) as illuminate_plan_cost,
	SUM(claim_count) as claim_count,
	SUM(member_count) as member_count
from
	category_summary)
select
	json_build_object( 'results', json_agg( json_build_object( 'category', category, 'incumbent_plan_cost', TO_CHAR(incumbent_plan_cost, '$FM999,999,999.00'), 'illuminate_plan_cost', TO_CHAR(illuminate_plan_cost, '$FM999,999,999.00'), 'savings', TO_CHAR(incumbent_plan_cost - illuminate_plan_cost, '$FM999,999,999.00'), 'claim_count', claim_count, 'member_count', member_count ) order by case category when 'Specialty' then 1 when 'Non-Specialty' then 2 else 3 end ) ) as results FROM (
	select
		*
	from
		category_summary
union all
	select
		*
	from
		total_summary) as all_summary;
  `;

  try {
    const result = await client.query(query, [fileId]);
    return result.rows[0]?.results || null;
  } catch (error) {
    console.error('Error during formulary exclusions analysis:', error);
    throw error;
  }
}

/**
 * Update claim records with formulary_disruption flag
 */
async function updateFormularyDisruptions(client: Client, fileId: string) {
  const query = `
  WITH matching_records AS (
    SELECT cr.record_id
    FROM edpm.claim_records cr
    WHERE cr.file_id = $1
      AND cr.lookup_fields->>'is_in_formulary' = 'false'
      AND cr.exclusion_type IS NULL
)
UPDATE edpm.claim_records cr
SET exclusion_type = 'formulary_exclusion',
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'lambda-formulary-disruption'
FROM matching_records mr
WHERE cr.record_id = mr.record_id;

  `;

  try {
    const result = await client.query(query, [fileId]);
    console.log(`Updated ${result.rowCount} claim records with formulary_disruption flag`);
    return result.rowCount;
  } catch (error) {
    console.error('Error updating formulary disruptions:', error);
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
    const createdBy = 'lambda-formulary-exclusions-processor';
    
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