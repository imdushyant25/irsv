// File: src/app/api/files/[fileId]/enrichment/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { EnrichmentStatus } from '@/types/enrichment';

// Define interfaces for the response
interface TimingInfo {
  startedAt: string;
  completedAt?: string;
  durationSeconds?: number;
}

interface EnrichmentProgress {
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  percentComplete: number;
}

interface EnrichmentField {
  name: string;
  count: number;
  totalRecords: number;
}

interface EnrichmentStatusResponse {
  status: EnrichmentStatus | "NOT_STARTED";
  progress?: EnrichmentProgress;
  timing?: TimingInfo;
  enrichedFields?: EnrichmentField[] | null;
  runId?: string;
  errorDetails?: any;
  message?: string;
  fileId?: string;
}

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

    // First check if the file exists
    const fileResult = await query(`
      SELECT file_id
      FROM claims_file_registry
      WHERE file_id = $1
    `, [fileId]);

    if (fileResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Then look for the most recent enrichment run
    const result = await query(`
      SELECT 
        run_id as "runId",
        status,
        total_records as "totalRecords",
        enriched_records as "enrichedRecords",
        failed_records as "failedRecords",
        started_at as "startedAt",
        completed_at as "completedAt",
        error_details as "errorDetails"
      FROM enrichment_runs
      WHERE file_id = $1
      ORDER BY started_at DESC
      LIMIT 1
    `, [fileId]);

    // If no enrichment run exists yet, return a "not started" status instead of 404
    if (result.rows.length === 0) {
      const notStartedResponse: EnrichmentStatusResponse = {
        status: "NOT_STARTED",
        message: "No enrichment has been started for this file",
        fileId
      };
      return NextResponse.json(notStartedResponse, { status: 200 });  // Return 200 OK instead of 404
    }

    const run = result.rows[0];

    // Calculate progress percentage
    const percentComplete = run.totalRecords > 0
      ? Math.round((run.enrichedRecords + run.failedRecords) / run.totalRecords * 100)
      : 0;

    // Get enriched field statistics if run is completed
    let enrichedFields = null;
    let timing = {
      startedAt: run.startedAt,
      completedAt: run.completedAt
    };

    // Add duration if both start and end times exist
    if (run.startedAt && run.completedAt) {
      const startTime = new Date(run.startedAt).getTime();
      const endTime = new Date(run.completedAt).getTime();
      if (!isNaN(startTime) && !isNaN(endTime)) {
        //timing.durationSeconds = Math.round((endTime - startTime) / 1000);
      }
    }

    if (run.status === EnrichmentStatus.COMPLETED) {
      // Get count of records with each enriched field
      try {
        const fieldsResult = await query(`
          SELECT 
            jsonb_object_keys(dynamic_fields) as name,
            COUNT(*) as count
          FROM claim_records
          WHERE 
            file_id = $1 AND 
            dynamic_fields IS NOT NULL AND 
            dynamic_fields != '{}'::jsonb
          GROUP BY jsonb_object_keys(dynamic_fields)
        `, [fileId]);

        if (fieldsResult.rows.length > 0) {
          enrichedFields = fieldsResult.rows.map(row => ({
            name: row.name,
            count: parseInt(row.count),
            totalRecords: run.totalRecords
          }));
        }
      } catch (err) {
        console.warn('Failed to get enriched field stats:', err);
        // Continue without field stats on error
      }
    }

    // Format the response
    const response: EnrichmentStatusResponse = {
      status: run.status,
      progress: {
        totalRecords: run.totalRecords,
        processedRecords: run.enrichedRecords + run.failedRecords,
        failedRecords: run.failedRecords,
        percentComplete
      },
      timing,
      enrichedFields,
      runId: run.runId
    };

    // Add error details if present
    if (run.status === EnrichmentStatus.ERROR && run.errorDetails) {
      response.errorDetails = run.errorDetails;
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error checking enrichment status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check enrichment status',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}