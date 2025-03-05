// File: src/app/api/files/[fileId]/process/status/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ProcessingStatus } from '@/types/claims-processing';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params;

  if (!fileId) {
    return NextResponse.json(
      { error: 'File ID is required' },
      { status: 400 }
    );
  }

  try {
    // Get the most recent processing record for the file
    const result = await query(`
      SELECT 
        processing_id as "processingId",
        status,
        total_rows as "totalRows",
        processed_rows as "processedRows",
        error_details as "errorDetails",
        start_time as "startTime",
        end_time as "endTime"
      FROM claim_processing_history
      WHERE file_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [fileId]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'No processing history found' },
        { status: 404 }
      );
    }

    const processingRecord = result.rows[0];

    // Calculate progress percentage
    const progress = processingRecord.totalRows > 0
      ? Math.round((processingRecord.processedRows / processingRecord.totalRows) * 100)
      : 0;

    // Format response based on status
    const response = {
      status: processingRecord.status,
      progress: {
        totalRows: processingRecord.totalRows,
        processedRows: processingRecord.processedRows,
        percentage: progress
      },
      startTime: processingRecord.startTime,
      endTime: processingRecord.endTime,
      processingId: processingRecord.processingId
    };

    // Add error details if present
    if (processingRecord.status === ProcessingStatus.ERROR && processingRecord.errorDetails) {
      return NextResponse.json({
        ...response,
        error: {
          message: processingRecord.errorDetails.message,
          details: processingRecord.errorDetails.details
        }
      });
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error checking processing status:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to check processing status',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}