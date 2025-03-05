// File: src/app/api/opportunities/[opportunityId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { opportunityId: string } }
) {
  try {
    console.log('Fetching opportunity with ID:', params.opportunityId); // Debug log

    if (!params.opportunityId) {
      return NextResponse.json(
        { error: 'Opportunity ID is required' },
        { status: 400 }
      );
    }

    const result = await query(`
      SELECT 
        id,
        opportunity_id as "opportunityId",
        product_id as "productId",
        employer,
        opportunity_owner as "opportunityOwner",
        financial_analyst as "financialAnalyst",
        strategic_pharmacy_analyst as "strategicPharmacyAnalyst",
        stage_name as "stageName",
        opportunity_metadata as "opportunityMetadata",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_by as "updatedBy",
        updated_at as "updatedAt"
      FROM opportunity 
      WHERE opportunity_id = $1
    `, [params.opportunityId]);

    console.log('Query result:', result.rows[0]); // Debug log

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Opportunity not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching opportunity:', error);
    return NextResponse.json(
      { error: 'Failed to fetch opportunity details' },
      { status: 500 }
    );
  }
}