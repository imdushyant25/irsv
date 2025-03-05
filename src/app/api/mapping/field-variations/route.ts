// File: src/app/api/mapping/field-variations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get('productId');

    const queryText = `
      SELECT 
        cfv.id,
        cfv.standard_field_id,
        cfv.variation_name
      FROM claim_field_variations cfv
      JOIN standard_claim_fields scf ON scf.id = cfv.standard_field_id
      WHERE cfv.is_active = true
      ${productId ? 'AND scf.product_id = $1' : ''}
      ORDER BY cfv.variation_name
    `;

    const values = productId ? [productId] : [];
    const result = await query(queryText, values);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching field variations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch field variations' },
      { status: 500 }
    );
  }
}