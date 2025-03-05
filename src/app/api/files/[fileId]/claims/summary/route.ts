// File: src/app/api/files/[fileId]/claims/summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params;

    // Get basic statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_claims,
        COUNT(*) FILTER (WHERE validation_status = 'valid') as valid_claims,
        COUNT(*) FILTER (WHERE validation_status = 'invalid') as invalid_claims,
        COUNT(*) FILTER (WHERE validation_status = 'warning') as warning_claims,
        jsonb_build_object(
          'processed', COUNT(*) FILTER (WHERE processing_status = 'processed'),
          'pending', COUNT(*) FILTER (WHERE processing_status = 'pending'),
          'failed', COUNT(*) FILTER (WHERE processing_status = 'failed')
        ) as processing_stats,
        COALESCE(SUM((mapped_fields->>'cost')::numeric), 0) as total_cost,
        COALESCE(AVG((mapped_fields->>'cost')::numeric), 0) as average_cost
      FROM claim_records
      WHERE file_id = $1
    `;

    // Get validation trends over time
    const trendsQuery = `
      WITH daily_stats AS (
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          COUNT(*) FILTER (WHERE validation_status = 'valid') as valid,
          COUNT(*) FILTER (WHERE validation_status = 'invalid') as invalid,
          COUNT(*) FILTER (WHERE validation_status = 'warning') as warning
        FROM claim_records
        WHERE file_id = $1
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date ASC
      )
      SELECT 
        TO_CHAR(date, 'YYYY-MM-DD') as date,
        valid,
        invalid,
        warning
      FROM daily_stats
    `;

    // Get cost distribution
    const costDistributionQuery = `
      WITH ranges AS (
        SELECT
          CASE
            WHEN (mapped_fields->>'cost')::numeric < 100 THEN '0-100'
            WHEN (mapped_fields->>'cost')::numeric < 500 THEN '100-500'
            WHEN (mapped_fields->>'cost')::numeric < 1000 THEN '500-1000'
            ELSE '1000+'
          END as range,
          COUNT(*) as count
        FROM claim_records
        WHERE file_id = $1 AND mapped_fields->>'cost' IS NOT NULL
        GROUP BY range
      )
      SELECT jsonb_agg(jsonb_build_object(
        'range', range,
        'count', count
      )) as cost_distribution
      FROM ranges
    `;

    // Execute all queries in parallel
    const [statsResult, trendsResult, costDistResult] = await Promise.all([
      query(statsQuery, [fileId]),
      query(trendsQuery, [fileId]),
      query(costDistributionQuery, [fileId])
    ]);

    const stats = statsResult.rows[0];
    const costDistribution = costDistResult.rows[0].cost_distribution || [];

    // Format response
    const response = {
      totalClaims: parseInt(stats.total_claims),
      validClaims: parseInt(stats.valid_claims),
      invalidClaims: parseInt(stats.invalid_claims),
      warningClaims: parseInt(stats.warning_claims),
      processingStats: stats.processing_stats,
      costSummary: {
        totalCost: parseFloat(stats.total_cost),
        averageCost: parseFloat(stats.average_cost),
        costDistribution
      },
      validationTrends: trendsResult.rows.map(row => ({
        date: row.date,
        valid: parseInt(row.valid),
        invalid: parseInt(row.invalid),
        warning: parseInt(row.warning)
      }))
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching claims summary:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch claims summary',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}