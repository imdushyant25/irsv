// File: src/app/api/files/[fileId]/status/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { 
  FileStatus, 
  ProcessingStage, 
  isValidStatusTransition,
  isValidStageTransition 
} from '@/types/file';
import { z } from 'zod';

// Validation schema for status update request
const updateStatusSchema = z.object({
  status: z.nativeEnum(FileStatus),
  processingStage: z.nativeEnum(ProcessingStage)
});

export async function PUT(
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

    // Validate request body
    const body = await request.json();
    const validationResult = updateStatusSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error },
        { status: 400 }
      );
    }

    const { status: newStatus, processingStage: newStage } = validationResult.data;

    // Start transaction
    await query('BEGIN');

    try {
      // Get current file status
      const currentFileQuery = `
        SELECT 
          status,
          processing_stage as "processingStage"
        FROM claims_file_registry
        WHERE file_id = $1
      `;
      
      const currentFile = await query(currentFileQuery, [fileId]);
      
      if (currentFile.rows.length === 0) {
        await query('ROLLBACK');
        return NextResponse.json(
          { error: 'File not found' },
          { status: 404 }
        );
      }

      const { status: currentStatus, processingStage: currentStage } = currentFile.rows[0];

      // Validate state transitions
      if (!isValidStatusTransition(currentStatus, newStatus)) {
        await query('ROLLBACK');
        return NextResponse.json(
          { error: `Invalid status transition from ${currentStatus} to ${newStatus}` },
          { status: 400 }
        );
      }

      if (!isValidStageTransition(currentStage, newStage)) {
        await query('ROLLBACK');
        return NextResponse.json(
          { error: `Invalid stage transition from ${currentStage} to ${newStage}` },
          { status: 400 }
        );
      }

      // Update file status and stage
      const updateQuery = `
        UPDATE claims_file_registry 
        SET 
          status = $1,
          processing_stage = $2,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = $3
        WHERE file_id = $4
        RETURNING 
          file_id as "fileId",
          status,
          processing_stage as "processingStage",
          updated_at as "updatedAt"
      `;

      const result = await query(updateQuery, [
        newStatus,
        newStage,
        'system', // TODO: Replace with actual user ID once auth is implemented
        fileId
      ]);

      // Log status change for audit purposes
      const logQuery = `
        INSERT INTO file_status_history (
          file_id,
          previous_status,
          new_status,
          previous_stage,
          new_stage,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;

      await query(logQuery, [
        fileId,
        currentStatus,
        newStatus,
        currentStage,
        newStage,
        'system' // TODO: Replace with actual user ID
      ]);

      await query('COMMIT');

      return NextResponse.json({
        message: 'File status updated successfully',
        file: result.rows[0]
      });

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error updating file status:', error);
    return NextResponse.json(
      { error: 'Failed to update file status' },
      { status: 500 }
    );
  }
}