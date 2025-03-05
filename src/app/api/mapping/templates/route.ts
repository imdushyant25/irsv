// File: src/app/api/mapping/templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// Validation schema for template creation
const templateSchema = z.object({
  templateName: z.string().min(1, 'Template name is required'),
  opportunityId: z.string().uuid('Invalid opportunity ID'),
  productId: z.string().min(1, 'Product ID is required'),
  mappings: z.array(z.object({
    sourceColumn: z.string(),
    standardFieldId: z.string().uuid('Invalid standard field ID'),
    transformationRule: z.object({
      type: z.string(),
      params: z.record(z.any())
    }).optional()
  }))
});

// Get templates with optional filtering
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const opportunityId = searchParams.get('opportunityId');
    const productId = searchParams.get('productId');

    // Build the query with proper pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM template_mappings
      WHERE is_active = true
      ${opportunityId ? 'AND opportunity_id = $1' : ''}
      ${productId ? `AND product_id = $${opportunityId ? '2' : '1'}` : ''}
    `;

    const countValues = [
      ...(opportunityId ? [opportunityId] : []),
      ...(productId ? [productId] : [])
    ];

    const countResult = await query(countQuery, countValues);
    const total = parseInt(countResult.rows[0].total);

    // Main query to fetch templates with their mappings
    const queryText = `
      WITH template_data AS (
        SELECT 
          t.id,
          t.template_name as "templateName",
          t.opportunity_id as "opportunityId",
          t.product_id as "productId",
          t.is_active as "isActive",
          t.created_at as "createdAt",
          t.created_by as "createdBy",
          t.updated_at as "updatedAt",
          t.updated_by as "updatedBy",
          json_agg(
            json_build_object(
              'id', m.id,
              'sourceColumn', m.source_column,
              'standardFieldId', m.standard_field_id,
              'transformationRule', m.transformation_rule
            )
          ) FILTER (WHERE m.id IS NOT NULL) as "mappings"
        FROM template_mappings t
        LEFT JOIN mapping_templates m ON t.id = m.template_id
        WHERE t.is_active = true
        ${opportunityId ? 'AND t.opportunity_id = $1' : ''}
        ${productId ? `AND t.product_id = $${opportunityId ? '2' : '1'}` : ''}
        GROUP BY t.id
        ORDER BY t.created_at DESC
        LIMIT $${countValues.length + 1} OFFSET $${countValues.length + 2}
      )
      SELECT 
        td.*,
        json_build_object(
          'id', scf.id,
          'fieldName', scf.field_name,
          'displayName', scf.display_name
        ) as "standardField"
      FROM template_data td
      LEFT JOIN standard_claim_fields scf ON scf.id = td.mappings->0->>'standardFieldId';
    `;

    const queryValues = [
      ...countValues,
      limit,
      offset
    ];

    const result = await query(queryText, queryValues);

    // Format the response with pagination details
    return NextResponse.json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// Create new template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const validatedData = templateSchema.parse(body);
    
    // Start transaction
    await query('BEGIN');

    try {
      // Create template
      const templateId = uuidv4();
      const templateResult = await query(`
        INSERT INTO template_mappings (
          id,
          template_name,
          opportunity_id,
          product_id,
          is_active,
          created_by
        ) VALUES ($1, $2, $3, $4, true, $5)
        RETURNING *
      `, [
        templateId,
        validatedData.templateName,
        validatedData.opportunityId,
        validatedData.productId,
        'system' // TODO: Replace with actual user ID once auth is implemented
      ]);

      // Create mappings
      const mappingValues = validatedData.mappings.map(mapping => ([
        uuidv4(),
        templateId,
        mapping.sourceColumn,
        mapping.standardFieldId,
        mapping.transformationRule ? JSON.stringify(mapping.transformationRule) : null,
        'system' // TODO: Replace with actual user ID
      ]));

      if (mappingValues.length > 0) {
        const mappingPlaceholders = mappingValues.map((_, i) => 
          `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
        ).join(', ');

        await query(`
          INSERT INTO mapping_templates (
            id,
            template_id,
            source_column,
            standard_field_id,
            transformation_rule,
            created_by
          ) VALUES ${mappingPlaceholders}
        `, mappingValues.flat());
      }

      await query('COMMIT');

      return NextResponse.json({
        message: 'Template created successfully',
        templateId: templateId
      });

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error creating template:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    );
  }
}

// Update existing template
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const validatedData = templateSchema.parse(body);
    const templateId = request.nextUrl.searchParams.get('id');

    if (!templateId) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      );
    }

    // Start transaction
    await query('BEGIN');

    try {
      // Update template
      await query(`
        UPDATE template_mappings 
        SET 
          template_name = $1,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = $2
        WHERE id = $3 AND is_active = true
      `, [
        validatedData.templateName,
        'system', // TODO: Replace with actual user ID
        templateId
      ]);

      // Delete existing mappings
      await query(`
        DELETE FROM mapping_templates 
        WHERE template_id = $1
      `, [templateId]);

      // Create new mappings
      const mappingValues = validatedData.mappings.map(mapping => ([
        uuidv4(),
        templateId,
        mapping.sourceColumn,
        mapping.standardFieldId,
        mapping.transformationRule ? JSON.stringify(mapping.transformationRule) : null,
        'system' // TODO: Replace with actual user ID
      ]));

      if (mappingValues.length > 0) {
        const mappingPlaceholders = mappingValues.map((_, i) => 
          `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
        ).join(', ');

        await query(`
          INSERT INTO mapping_templates (
            id,
            template_id,
            source_column,
            standard_field_id,
            transformation_rule,
            created_by
          ) VALUES ${mappingPlaceholders}
        `, mappingValues.flat());
      }

      await query('COMMIT');

      return NextResponse.json({
        message: 'Template updated successfully',
        templateId: templateId
      });

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error updating template:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  }
}

// Delete template (soft delete)
export async function DELETE(request: NextRequest) {
  try {
    const templateId = request.nextUrl.searchParams.get('id');

    if (!templateId) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      );
    }

    await query(`
      UPDATE template_mappings 
      SET 
        is_active = false,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = $1
      WHERE id = $2
    `, ['system', templateId]); // TODO: Replace 'system' with actual user ID

    return NextResponse.json({
      message: 'Template deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}