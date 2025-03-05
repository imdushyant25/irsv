// File: src/app/api/mapping/standard-fields/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get('productId');

    const queryText = `
      SELECT 
        id,
        product_id as "productId",
        field_name as "fieldName",
        display_name as "displayName",
        description,
        data_type as "dataType",
        requirement_level as "requirementLevel",
        validation_rules as "validationRules",
        is_active as "isActive"
      FROM standard_claim_fields
      WHERE is_active = true
      ${productId ? 'AND product_id = $1' : ''}
      ORDER BY display_order ASC
    `;

    const values = productId ? [productId] : [];
    const result = await query(queryText, values);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching standard fields:', error);
    return NextResponse.json(
      { error: 'Failed to fetch standard fields' },
      { status: 500 }
    );
  }
}