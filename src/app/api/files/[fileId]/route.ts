// File: src/app/api/files/[fileId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params;

    const queryText = `
      SELECT 
        file_id as "fileId",
        opportunity_id as "opportunityId",
        product_id as "productId",
        original_filename as "originalFilename",
        upload_date as "uploadDate",
        s3_location as "s3Location",
        status,
        file_size as "fileSize",
        original_headers as "originalHeaders",
        row_count as "rowCount",
        processing_stage as "processingStage"
      FROM claims_file_registry
      WHERE file_id = $1
    `;

    const result = await query(queryText, [fileId]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error retrieving file details:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve file details' },
      { status: 500 }
    );
  }
}