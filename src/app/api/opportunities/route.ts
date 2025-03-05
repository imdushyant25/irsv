// File: src/app/api/opportunities/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const result = await query(`
      SELECT 
        id,
        opportunity_id as "opportunityId",
        employer,
        stage_name as "stageName",
        product_id as "productId",
        opportunity_owner as "opportunityOwner",
        created_at as "createdAt"
      FROM opportunity 
      ORDER BY created_at DESC
    `);

    console.log('Opportunities API response:', result.rows);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch opportunities' },
      { status: 500 }
    );
  }
}