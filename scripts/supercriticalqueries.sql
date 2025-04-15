--formulary exclusion
WITH base_formulary AS (
    SELECT 
        file_id,
        (lookup_fields->>'formulary') AS formulary
    FROM edpm.claim_records
    WHERE file_id = :file_id
    LIMIT 1
),
eligible_claims AS (
    SELECT cr.record_id,
           cr.lookup_fields,
           cr.mapped_fields,
           (cr.lookup_fields->>'ndc11') AS ndc11,
           CASE
               WHEN bf.formulary = '4th PBM Closed Formulary' THEN 'open_formulary'
               ELSE 'closed_formulary'
           END AS process_formulary
    FROM edpm.claim_records cr
    JOIN base_formulary bf ON cr.file_id = bf.file_id
    WHERE cr.file_id = :file_id
      AND NOT (cr.lookup_fields ? 'Exclusion Type')
      AND (
          (bf.formulary = '4th PBM Closed Formulary' 
              AND (cr.lookup_fields->>'is_closed_formulary') IS DISTINCT FROM 'Y')
          OR
          (bf.formulary = '4th PBM Open Formulary' 
              AND (cr.lookup_fields->>'is_open_formulary') IS DISTINCT FROM 'Y')
      )
),
claims_with_gpi AS (
    SELECT ec.*,
           mi.gpi14,
           LEFT(mi.gpi14, 6) AS gpi6,
           LEFT(mi.gpi14, 4) AS gpi4,
           LEFT(mi.gpi14, 2) AS gpi2
    FROM eligible_claims ec
    LEFT JOIN edpm.mspan_ndc_info mi ON ec.ndc11 = mi.ndc11
),
gpi_ranked_matches AS (
    SELECT 
        c.record_id,
        c.lookup_fields,
        c.mapped_fields,
        dm.specialty_indicator,
        dm.brnd_gnrc,

        CASE
            WHEN dm.gpi6 = c.gpi6 THEN 'gpi6'
            WHEN dm.gpi4 = c.gpi4 THEN 'gpi4'
            WHEN dm.gpi2 = c.gpi2 THEN 'gpi2'
        END AS matched_gpi_level,

        CASE
            WHEN dm.gpi6 = c.gpi6 THEN dm.gpi6_awp_per_ds
            WHEN dm.gpi4 = c.gpi4 THEN dm.gpi4_awp_per_ds
            WHEN dm.gpi2 = c.gpi2 THEN dm.gpi2_awp_per_ds
        END AS awp_per_ds,

        CASE
            WHEN dm.gpi6 = c.gpi6 THEN dm.gpi6_avg_disc
            WHEN dm.gpi4 = c.gpi4 THEN dm.gpi4_avg_disc
            WHEN dm.gpi2 = c.gpi2 THEN dm.gpi2_avg_disc
        END AS avg_disc,

        CASE
            WHEN dm.gpi6 = c.gpi6 THEN dm.gpi6_rebate_yield
            WHEN dm.gpi4 = c.gpi4 THEN dm.gpi4_rebate_yield
            WHEN dm.gpi2 = c.gpi2 THEN dm.gpi2_rebate_yield
        END AS rebate_yield,

        ROW_NUMBER() OVER (
            PARTITION BY c.record_id
            ORDER BY 
                CASE 
                    WHEN dm.gpi6 = c.gpi6 THEN 1
                    WHEN dm.gpi4 = c.gpi4 THEN 2
                    WHEN dm.gpi2 = c.gpi2 THEN 3
                    ELSE 4
                END
        ) AS rn

    FROM claims_with_gpi c
    JOIN edpm.drugs_master dm
      ON (
            (dm.gpi6 = c.gpi6 AND c.process_formulary = 'open_formulary' AND dm.is_closed_formulary = 'Y') OR
            (dm.gpi6 = c.gpi6 AND c.process_formulary = 'closed_formulary' AND dm.is_open_formulary = 'Y') OR
            (dm.gpi4 = c.gpi4 AND c.process_formulary = 'open_formulary' AND dm.is_closed_formulary = 'Y') OR
            (dm.gpi4 = c.gpi4 AND c.process_formulary = 'closed_formulary' AND dm.is_open_formulary = 'Y') OR
            (dm.gpi2 = c.gpi2 AND c.process_formulary = 'open_formulary' AND dm.is_closed_formulary = 'Y') OR
            (dm.gpi2 = c.gpi2 AND c.process_formulary = 'closed_formulary' AND dm.is_open_formulary = 'Y')
         )
),
gpi_matched_claims AS (
    SELECT * FROM gpi_ranked_matches WHERE rn = 1
),
costs AS (
    SELECT *,
        COALESCE((lookup_fields->>'days_supply')::numeric, 0) AS days_supply,
        COALESCE((lookup_fields->>'member_copay')::numeric, 0) AS member_copay,
        COALESCE((mapped_fields->>'plan_cost')::numeric, 0) AS plan_cost,
        CASE
            WHEN specialty_indicator = 'Y' AND brnd_gnrc LIKE 'B%' THEN
                ((awp_per_ds * avg_disc * COALESCE((lookup_fields->>'days_supply')::numeric, 0)) 
                - COALESCE((lookup_fields->>'member_copay')::numeric, 0))
                - (awp_per_ds * COALESCE((lookup_fields->>'days_supply')::numeric, 0) * rebate_yield)
            WHEN specialty_indicator = 'Y' AND brnd_gnrc LIKE 'G%' THEN
                ((awp_per_ds * avg_disc * COALESCE((lookup_fields->>'days_supply')::numeric, 0)) 
                - COALESCE((lookup_fields->>'member_copay')::numeric, 0))
            WHEN specialty_indicator <> 'Y' AND brnd_gnrc LIKE 'B%' THEN
                ((awp_per_ds * avg_disc * COALESCE((lookup_fields->>'days_supply')::numeric, 0)) 
                - COALESCE((lookup_fields->>'member_copay')::numeric, 0))
                - (awp_per_ds * COALESCE((lookup_fields->>'days_supply')::numeric, 0) * rebate_yield)
            WHEN specialty_indicator <> 'Y' AND brnd_gnrc LIKE 'G%' THEN
                ((awp_per_ds * avg_disc * COALESCE((lookup_fields->>'days_supply')::numeric, 0)) 
                - COALESCE((lookup_fields->>'member_copay')::numeric, 0))
        END AS net_cost
    FROM gpi_matched_claims
),
agg AS (
    SELECT
        SUM(CASE WHEN specialty_indicator = 'Y' THEN plan_cost ELSE 0 END) AS specialty_plan_cost,
        AVG(CASE WHEN specialty_indicator = 'Y' THEN net_cost ELSE NULL END) AS specialty_net_avg_cost,
        SUM(CASE WHEN specialty_indicator <> 'Y' THEN plan_cost ELSE 0 END) AS non_specialty_plan_cost,
        AVG(CASE WHEN specialty_indicator <> 'Y' THEN net_cost ELSE NULL END) AS non_specialty_net_avg_cost
    FROM costs
)
SELECT 
  'Specialty' AS group_type,
  agg.specialty_plan_cost AS plan_cost,
  ROUND(agg.specialty_net_avg_cost, 2) AS net_avg_cost,
  ROUND(agg.specialty_plan_cost - agg.specialty_net_avg_cost, 2) AS cost_difference
FROM agg

UNION ALL

SELECT 
  'Non-Specialty' AS group_type,
  agg.non_specialty_plan_cost,
  ROUND(agg.non_specialty_net_avg_cost, 2),
  ROUND(agg.non_specialty_plan_cost - agg.non_specialty_net_avg_cost, 2)
FROM agg

UNION ALL

SELECT 
  'Total' AS group_type,
  (agg.specialty_plan_cost + agg.non_specialty_plan_cost),
  ROUND((agg.specialty_net_avg_cost + agg.non_specialty_net_avg_cost), 2),
  ROUND(
    (agg.specialty_plan_cost + agg.non_specialty_plan_cost)
    - (agg.specialty_net_avg_cost + agg.non_specialty_net_avg_cost), 2
  )
FROM agg;

-- formulary_exclusion_update

WITH base_formulary AS (
    SELECT file_id, (lookup_fields->>'formulary') AS formulary
    FROM edpm.claim_records
    WHERE file_id = :file_id
    LIMIT 1
),
eligible_claims AS (
    SELECT cr.record_id,
           (cr.lookup_fields->>'ndc11') AS ndc11,
           cr.lookup_fields,
           CASE
               WHEN bf.formulary = '4th PBM Closed Formulary' THEN 'open_formulary'
               ELSE 'closed_formulary'
           END AS process_formulary
    FROM edpm.claim_records cr
    JOIN base_formulary bf ON cr.file_id = bf.file_id
    WHERE cr.file_id = :file_id
      AND NOT (cr.lookup_fields ? 'Exclusion Type')
      AND (
          (bf.formulary = '4th PBM Closed Formulary' AND cr.lookup_fields->>'is_closed_formulary' IS DISTINCT FROM 'Y')
          OR
          (bf.formulary = '4th PBM Open Formulary' AND cr.lookup_fields->>'is_open_formulary' IS DISTINCT FROM 'Y')
      )
),
claims_with_gpi AS (
    SELECT ec.record_id,
           ec.lookup_fields,
           ec.process_formulary,
           LEFT(mi.gpi14, 6) AS gpi6,
           LEFT(mi.gpi14, 4) AS gpi4,
           LEFT(mi.gpi14, 2) AS gpi2
    FROM eligible_claims ec
    LEFT JOIN edpm.mspan_ndc_info mi ON ec.ndc11 = mi.ndc11
),
matched_claims AS (
    SELECT DISTINCT c.record_id
    FROM claims_with_gpi c
    JOIN edpm.drugs_master dm
      ON (
            (dm.gpi6 = c.gpi6 AND c.process_formulary = 'open_formulary' AND dm.is_closed_formulary = 'Y') OR
            (dm.gpi6 = c.gpi6 AND c.process_formulary = 'closed_formulary' AND dm.is_open_formulary = 'Y') OR
            (dm.gpi4 = c.gpi4 AND c.process_formulary = 'open_formulary' AND dm.is_closed_formulary = 'Y') OR
            (dm.gpi4 = c.gpi4 AND c.process_formulary = 'closed_formulary' AND dm.is_open_formulary = 'Y') OR
            (dm.gpi2 = c.gpi2 AND c.process_formulary = 'open_formulary' AND dm.is_closed_formulary = 'Y') OR
            (dm.gpi2 = c.gpi2 AND c.process_formulary = 'closed_formulary' AND dm.is_open_formulary = 'Y')
         )
),
disruptions AS (
    SELECT c.record_id
    FROM claims_with_gpi c
    LEFT JOIN matched_claims m ON c.record_id = m.record_id
    WHERE m.record_id IS NULL
)
UPDATE edpm.claim_records cr
SET lookup_fields = jsonb_set(cr.lookup_fields, '{formulary_disruption}', '"Y"', true)
FROM disruptions d
WHERE cr.record_id = d.record_id;

