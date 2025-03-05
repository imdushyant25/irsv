// File: src/app/api/opportunities/[opportunityId]/parameters/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { opportunityId: string } }
) {
  try {
    const { opportunityId } = params;
    const generalInformation = await request.json();

    // Update the opportunity's metadata with the new parameters
    const result = await query(`
      UPDATE opportunity 
      SET 
        opportunity_metadata = jsonb_set(
          COALESCE(opportunity_metadata, '{}'::jsonb),
          '{generalInformation}',
          $1::jsonb
        ),
        updated_at = CURRENT_TIMESTAMP,
        updated_by = $2
      WHERE opportunity_id = $3
      RETURNING *
    `, [JSON.stringify(generalInformation), 'system', opportunityId]);

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'Opportunity not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'General Information updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating general information:', error);
    return NextResponse.json(
      { error: 'Failed to update general information' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { opportunityId: string } }
) {
  try {
    const { opportunityId } = params;

    const result = await query(`
      SELECT opportunity_metadata->'generalInformation' as generalInformation
      FROM opportunity
      WHERE opportunity_id = $1
    `, [opportunityId]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Opportunity not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      generalInformation: result.rows[0].parameters || {}
    });
  } catch (error) {
    console.error('Error fetching parameters:', error);
    return NextResponse.json(
      { error: 'Failed to fetch parameters' },
      { status: 500 }
    );
  }
}