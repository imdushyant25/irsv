// File: src/app/api/files/[fileId]/mapping/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { FileStatus, ProcessingStage } from '@/types/file';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// Validation schema for mapping request
const mappingSchema = z.object({
  mapping: z.record(z.string(), z.string())
});

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params;

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    // Get the most recent active template for this file
    const templateQuery = `
      SELECT 
        tm.id as "templateId",
        tm.template_name as "templateName",
        tm.file_id as "fileId",
        f.status,
        f.processing_stage as "processingStage"
      FROM template_mappings tm
      JOIN claims_file_registry f ON f.file_id = tm.file_id
      WHERE tm.file_id = $1 AND tm.is_active = true
      ORDER BY tm.created_at DESC
      LIMIT 1
    `;

    const templateResult = await query(templateQuery, [fileId]);
    
    if (templateResult.rows.length === 0) {
      return NextResponse.json(
        { mappings: [] }
      );
    }

    const template = templateResult.rows[0];

    // Get all mappings for this template
    const mappingsQuery = `
      SELECT 
        mt.source_column as "sourceColumn",
        mt.standard_field_id as "standardFieldId",
        mt.transformation_rule as "transformationRule",
        scf.field_name as "fieldName",
        scf.display_name as "displayName",
        scf.data_type as "dataType",
        scf.requirement_level as "requirementLevel"
      FROM mapping_templates mt
      JOIN standard_claim_fields scf ON scf.id = mt.standard_field_id
      WHERE mt.template_id = $1
    `;

    const mappingsResult = await query(mappingsQuery, [template.templateId]);

    return NextResponse.json({
      fileStatus: template.status,
      processingStage: template.processingStage,
      templateName: template.templateName,
      mappings: mappingsResult.rows
    });

  } catch (error) {
    console.error('Error fetching mappings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mappings' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params;
    
    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    // Validate request body
    const body = await request.json();
    const validationResult = mappingSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error },
        { status: 400 }
      );
    }

    const { mapping } = validationResult.data;

    // Start transaction
    await query('BEGIN');

    try {
      // First check if a template already exists for this file
      const existingTemplateQuery = `
        SELECT id, template_name 
        FROM template_mappings 
        WHERE file_id = $1 AND is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      `;
      
      const existingTemplate = await query(existingTemplateQuery, [fileId]);
      let templateId;
      let templateName;

      if (existingTemplate.rows.length > 0) {
        // Use existing template
        templateId = existingTemplate.rows[0].id;
        templateName = existingTemplate.rows[0].template_name;
        
        // Delete existing mappings for this template
        await query(
          'DELETE FROM mapping_templates WHERE template_id = $1',
          [templateId]
        );
      } else {
        // Create new template only if one doesn't exist
        const { opportunity_id, product_id, original_filename } = 
          (await query('SELECT opportunity_id, product_id, original_filename FROM claims_file_registry WHERE file_id = $1', [fileId])).rows[0];

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        templateName = `${product_id}_${original_filename.split('.')[0]}_${timestamp}`;
        templateId = uuidv4();

        await query(`
          INSERT INTO template_mappings (
            id, template_name, file_id, opportunity_id, product_id, is_active, created_by
          ) VALUES ($1, $2, $3, $4, $5, true, $6)
        `, [templateId, templateName, fileId, opportunity_id, product_id, 'system']);
      }

      // Insert new mappings
      const mappingValues = Object.entries(mapping).map(([sourceColumn, standardFieldId]) => ([
        uuidv4(),
        templateId,
        sourceColumn,
        standardFieldId,
        null, // transformation_rule
        'system' // created_by
      ]));

      if (mappingValues.length > 0) {
        const mappingPlaceholders = mappingValues.map((_, i) => 
          `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
        ).join(', ');

        await query(`
          INSERT INTO mapping_templates (
            id, template_id, source_column, standard_field_id, transformation_rule, created_by
          ) VALUES ${mappingPlaceholders}
        `, mappingValues.flat());
      }

      // Update file status
      const updateFileQuery = `
        UPDATE claims_file_registry 
        SET 
          status = $1,
          processing_stage = $2,
          updated_at = CURRENT_TIMESTAMP,
          updated_by = $3
        WHERE file_id = $4
        RETURNING 
          file_id as "fileId",
          status,
          processing_stage as "processingStage"
      `;

      const updatedFile = await query(updateFileQuery, [
        FileStatus.MAPPED,
        ProcessingStage.MAPPING_COMPLETE,
        'system',
        fileId
      ]);

      await query('COMMIT');

      return NextResponse.json({
        message: 'Mapping saved successfully',
        file: updatedFile.rows[0],
        templateId,
        templateName
      });

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error saving mapping:', error);
    return NextResponse.json(
      { error: 'Failed to save mapping' },
      { status: 500 }
    );
  }
}