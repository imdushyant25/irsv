// File: src/app/api/files/[fileId]/batches/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params;

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    // Get aggregate stats on batches for this file
    const result = await query(`
      SELECT 
        COUNT(*) as total_batches,
        SUM(CASE WHEN processing_status = 'PROCESSED' THEN 1 ELSE 0 END) as processed_batches,
        SUM(CASE WHEN enrichment_status = 'COMPLETED' THEN 1 ELSE 0 END) as enriched_batches,
        SUM(CASE WHEN processing_status = 'ERROR' OR enrichment_status = 'ERROR' THEN 1 ELSE 0 END) as failed_batches,
        MAX(updated_at) as last_updated
      FROM batch_processing_status
      WHERE file_id = $1
    `, [fileId]);

    if (result.rows.length === 0) {
      return NextResponse.json({
        totalBatches: 0,
        processedBatches: 0,
        enrichedBatches: 0,
        failedBatches: 0,
        lastUpdated: null
      });
    }

    const stats = {
      totalBatches: parseInt(result.rows[0].total_batches) || 0,
      processedBatches: parseInt(result.rows[0].processed_batches) || 0,
      enrichedBatches: parseInt(result.rows[0].enriched_batches) || 0,
      failedBatches: parseInt(result.rows[0].failed_batches) || 0,
      lastUpdated: result.rows[0].last_updated
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching batch statistics:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch batch statistics',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}