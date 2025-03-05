// File: src/app/api/opportunities/[opportunityId]/files/[fileId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { S3Client } from '@aws-sdk/client-s3';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function GET(
  request: NextRequest,
  { params }: { params: { opportunityId: string; fileId: string } }
) {
  try {
    const { opportunityId, fileId } = params;
    
    const result = await pool.query(
      'SELECT * FROM claims_file_registry WHERE opportunity_id = $1 AND file_id = $2',
      [opportunityId, fileId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching file:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// File upload endpoint should be at the parent level