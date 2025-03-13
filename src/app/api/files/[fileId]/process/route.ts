// File: src/app/api/files/[fileId]/process/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/db';
import { FileStatus } from '@/types/file';
import { ProcessingStatus } from '@/types/claims-processing';
import { createClaimsProcessor } from '@/services/claims-processing';
import { features } from '@/config/features';
import { invokeLambda } from '@/lib/aws/lambda';

async function validateProcessing(fileId: string) {
  // Existing validation logic remains unchanged
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
          created_by,
          processing_mode
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        processingId,
        fileId,
        ProcessingStatus.PENDING,
        fileDetails.rowCount,
        'system', // TODO: Replace with actual user ID once auth is implemented
        features.useLambdaProcessing ? 'lambda' : 'standard'
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

      // Determine whether to use Lambda or local processing
      if (features.useLambdaProcessing && features.lambdaFeatures.fileProcessing) {
        // Lambda processing path
        console.log(`Using Lambda for file processing: ${fileId}`);
        
        try {
          // Check if Lambda is properly configured
          const lambdaName = process.env.FILE_PROCESSOR_LAMBDA_NAME || 'file-processor';
          console.log(`Using Lambda function name: ${lambdaName}`);
          
          // Create payload
          const payload = {
            fileId,
            processingId,
            s3Location: fileDetails.s3Location
          };
          
          // For troubleshooting, log the payload
          console.log('Lambda payload:', JSON.stringify(payload));
          
          // Use 'Event' invocation type for asynchronous processing
          // This will return immediately and not wait for the Lambda to complete
          await invokeLambda(
            lambdaName,
            payload,
            'Event' // Asynchronous invocation
          );
          
          console.log(`Lambda invocation successful for file: ${fileId}`);
        } catch (lambdaError) {
          console.error('Lambda invocation error:', lambdaError);
          
          // Update the processing status to error
          await updateProcessingError(processingId, lambdaError);
          
          // Return error response
          return NextResponse.json(
            {
              error: 'Lambda invocation failed',
              details: lambdaError instanceof Error ? lambdaError.message : 'Unknown error'
            },
            { status: 500 }
          );
        }
      } else {
        // Local processing path (existing implementation)
        console.log(`Using local processing for file: ${fileId}`);
        const processor = createClaimsProcessor(
          fileId,
          processingId,
          fileDetails.s3Location
        );

        // Start processing in background
        processor.process().catch(error => {
          console.error('Background processing error:', error);
        });
      }

      return NextResponse.json({
        processingId,
        status: ProcessingStatus.PENDING,
        message: 'File processing initiated',
        mode: features.useLambdaProcessing ? 'lambda' : 'standard'
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

// Helper function to update processing status on Lambda error
async function updateProcessingError(processingId: string, error: any) {
  try {
    const errorDetails = {
      message: error instanceof Error ? error.message : 'Unknown Lambda error',
      timestamp: new Date().toISOString(),
      details: error instanceof Error ? error.stack : String(error)
    };

    await query(`
      UPDATE claim_processing_history
      SET 
        status = $1,
        error_details = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE processing_id = $3
    `, [
      ProcessingStatus.ERROR,
      JSON.stringify(errorDetails),
      processingId
    ]);
    
    // Also update the file status to ERROR
    const fileIdResult = await query(`
      SELECT file_id 
      FROM claim_processing_history 
      WHERE processing_id = $1
    `, [processingId]);
    
    if (fileIdResult.rows.length > 0) {
      const fileId = fileIdResult.rows[0].file_id;
      
      await query(`
        UPDATE claims_file_registry
        SET 
          status = $1,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = 'system'
        WHERE file_id = $2
      `, [FileStatus.ERROR, fileId]);
    }
  } catch (dbError) {
    console.error('Failed to update error status:', dbError);
  }
}