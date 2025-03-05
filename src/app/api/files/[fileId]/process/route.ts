// File: src/app/api/files/[fileId]/process/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/db';
import { FileStatus } from '@/types/file';
import { ProcessingStatus } from '@/types/claims-processing';
import { createClaimsProcessor } from '@/services/claims-processing';

async function validateProcessing(fileId: string) {
  // Get current file status and details
  const fileResult = await query(`
    SELECT 
      file_id,
      status,
      s3_location,
      row_count
    FROM claims_file_registry 
    WHERE file_id = $1
  `, [fileId]);

  if (fileResult.rows.length === 0) {
    throw new Error('File not found');
  }

  const file = fileResult.rows[0];

  // Verify file is in correct state
  if (file.status !== FileStatus.MAPPED) {
    throw new Error('File must be mapped before processing');
  }

  // Check if file is already being processed
  const processingResult = await query(`
    SELECT processing_id 
    FROM claim_processing_history
    WHERE file_id = $1 AND status = $2
  `, [fileId, ProcessingStatus.PROCESSING]);

  if (processingResult.rows.length > 0) {
    throw new Error('File is already being processed');
  }

  return {
    s3Location: file.s3_location,
    rowCount: file.row_count
  };
}

export async function POST(
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
    // Start transaction
    await query('BEGIN');

    try {
      // Validate processing request
      const fileDetails = await validateProcessing(fileId);

      // Create processing history record
      const processingId = uuidv4();
      await query(`
        INSERT INTO claim_processing_history (
          processing_id,
          file_id,
          status,
          total_rows,
          created_by
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        processingId,
        fileId,
        ProcessingStatus.PENDING,
        fileDetails.rowCount,
        'system' // TODO: Replace with actual user ID once auth is implemented
      ]);

      // Update file status
      await query(`
        UPDATE claims_file_registry
        SET 
          status = $1,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = $2
        WHERE file_id = $3
      `, [
        FileStatus.PROCESSING_CLAIMS,
        'system', // TODO: Replace with actual user ID
        fileId
      ]);

      await query('COMMIT');

      // Initialize claims processor
      const processor = createClaimsProcessor(
        fileId,
        processingId,
        fileDetails.s3Location
      );

      // Start processing in background
      processor.process().catch(error => {
        console.error('Background processing error:', error);
      });

      return NextResponse.json({
        processingId,
        status: ProcessingStatus.PENDING,
        message: 'File processing initiated'
      });

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error initiating claims processing:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to initiate processing',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}