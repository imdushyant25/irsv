// File: src/app/api/opportunities/[opportunityId]/files/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { opportunityId: string } }
) {
  try {
    const { opportunityId } = params;

    if (!opportunityId) {
      return NextResponse.json(
        { error: 'Opportunity ID is required' },
        { status: 400 }
      );
    }

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
      WHERE opportunity_id = $1
      ORDER BY upload_date DESC
    `;

    const result = await query(queryText, [opportunityId]);

    // Parse the original_headers if stored as JSON string
    const files = result.rows.map(file => ({
      ...file,
      originalHeaders: typeof file.originalHeaders === 'string' 
        ? JSON.parse(file.originalHeaders)
        : file.originalHeaders
    }));

    return NextResponse.json({ data: files });
  } catch (error) {
    console.error('Error retrieving files:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve files' },
      { status: 500 }
    );
  }
}

// Add POST method for file upload if needed in this route
export async function POST(
  request: NextRequest,
  { params }: { params: { opportunityId: string } }
) {
  // ... file upload logic
}