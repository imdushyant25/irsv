// File: src/app/api/files/upload/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { uploadToS3 } from '@/lib/aws/s3';
import { query } from '@/lib/db';
import { FileStatus, ProcessingStage } from '@/types/file';
import { z } from 'zod';

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types
const ALLOWED_FILE_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

/**
 * Validates the uploaded file
 */
function validateFile(file: File): { isValid: boolean; error?: string } {
  if (!file) {
    return { isValid: false, error: 'No file provided' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { isValid: false, error: 'File size exceeds 10MB limit' };
  }

  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return { isValid: false, error: 'Invalid file type. Only Excel files (.xlsx, .xls) are allowed' };
  }

  return { isValid: true };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const opportunityId = formData.get('opportunityId') as string;
    const productId = formData.get('productId') as string;
    const headersStr = formData.get('headers') as string;
    const rowCount = parseInt(formData.get('rowCount') as string);

    // Basic validation
    if (!file || !opportunityId || !productId || !headersStr) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate file
    const fileValidation = validateFile(file);
    if (!fileValidation.isValid) {
      return NextResponse.json(
        { error: fileValidation.error },
        { status: 400 }
      );
    }

    // Parse and validate headers
    let headers: string[];
    try {
      headers = JSON.parse(headersStr);
      if (!Array.isArray(headers)) {
        throw new Error('Headers must be an array');
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid headers format' },
        { status: 400 }
      );
    }

    // Get file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Generate unique file identifier
    const fileId = uuidv4();
    const timestamp = Date.now();
    
    // Upload to S3 with organized folder structure
    const s3Key = `claims-data/${productId}/${opportunityId}/${timestamp}-${file.name}`;
    await uploadToS3(
      buffer,
      s3Key,
      file.type
    );

    // Begin database transaction
    const client = await query('BEGIN');

    try {
      // Insert file record with correct initial states
      const insertQuery = `
        INSERT INTO claims_file_registry (
          file_id,
          opportunity_id,
          product_id,
          original_filename,
          s3_location,
          status,
          file_size,
          original_headers,
          row_count,
          processing_stage,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING 
          file_id as "fileId",
          original_filename as "originalFilename",
          upload_date as "uploadDate",
          status,
          processing_stage as "processingStage",
          row_count as "rowCount"
      `;

      const values = [
        fileId,
        opportunityId,
        productId,
        file.name,
        s3Key,
        FileStatus.PENDING,          // Initial status is PENDING
        file.size,
        JSON.stringify(headers),
        rowCount,
        ProcessingStage.READY_FOR_MAPPING,  // Initial stage is READY_FOR_MAPPING
        'system' // TODO: Replace with actual user ID once auth is implemented
      ];

      const result = await query(insertQuery, values);

      // Update opportunity last_activity
      await query(`
        UPDATE opportunity 
        SET 
          updated_at = CURRENT_TIMESTAMP,
          opportunity_metadata = jsonb_set(
            COALESCE(opportunity_metadata, '{}'::jsonb),
            '{last_file_upload}',
            $1::jsonb
          )
        WHERE opportunity_id = $2 
        AND product_id = $3
      `, [
        JSON.stringify({ 
          timestamp: new Date().toISOString(),
          fileId,
          rowCount 
        }),
        opportunityId,
        productId
      ]);

      await query('COMMIT');

      // Return success response with file details
      return NextResponse.json({
        fileId: result.rows[0].fileId,
        filename: result.rows[0].originalFilename,
        uploadDate: result.rows[0].uploadDate,
        status: result.rows[0].status,
        processingStage: result.rows[0].processingStage,
        rowCount: result.rows[0].rowCount,
        message: 'File uploaded successfully'
      });

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error in file upload:', error);
    
    return NextResponse.json(
      { error: 'Failed to process file upload' },
      { status: 500 }
    );
  }
}