// File: src/app/api/files/[fileId]/enrichment/validate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { enrichmentRuleRegistry } from '@/services/enrichment/EnrichmentRuleRegistry';
import { AgeRulesProcessor } from '@/services/enrichment/rules/AgeRulesProcessor';
import { ChannelRuleProcessor } from '@/services/enrichment/rules/ChannelRuleProcessor';

// Ensure all processors are registered
const ageRulesProcessor = new AgeRulesProcessor();
const channelRulesProcessor = new ChannelRuleProcessor();
enrichmentRuleRegistry.registerProcessor(ageRulesProcessor);
enrichmentRuleRegistry.registerProcessor(channelRulesProcessor);

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

    // Initialize the rule registry if not already done
    if (!enrichmentRuleRegistry.isInitialized()) {
      await enrichmentRuleRegistry.loadRules();
    }

    // Get the mapping for this file to check available fields
    const mappingResult = await query(`
      SELECT 
        mt.standard_field_id,
        scf.field_name
      FROM template_mappings tm
      JOIN mapping_templates mt ON tm.id = mt.template_id
      JOIN standard_claim_fields scf ON scf.id = mt.standard_field_id
      WHERE tm.file_id = $1 AND tm.is_active = true
    `, [fileId]);

    // Extract the field names from the mapping
    const mappedFields = mappingResult.rows.map(row => row.field_name);
    
    // Check each rule independently
    const ruleValidations = {
      age: {
        canRun: mappedFields.includes('member_dob') && mappedFields.includes('fill_date'),
        missingFields: [
          ...(!mappedFields.includes('member_dob') ? ['member_dob'] : []),
          ...(!mappedFields.includes('fill_date') ? ['fill_date'] : [])
        ]
      },
      channel: {
        canRun: mappedFields.includes('days_supply') && !mappedFields.includes('channel_indicator'),
        missingFields: [
          ...(!mappedFields.includes('days_supply') ? ['days_supply'] : []),
          ...(mappedFields.includes('channel_indicator') ? ['channel_indicator (already mapped)'] : [])
        ]
      }
    };

    // Determine if any enrichment can be performed
    const canRunAnyEnrichment = Object.values(ruleValidations).some(rule => rule.canRun);

    return NextResponse.json({
      canEnrich: canRunAnyEnrichment,
      ruleValidations,
      message: canRunAnyEnrichment 
        ? 'At least one enrichment rule can be applied' 
        : 'No enrichment rules can be applied with current mappings',
      mappedFields
    });

  } catch (error) {
    console.error('Error validating enrichment capabilities:', error);
    return NextResponse.json(
      { 
        error: 'Failed to validate enrichment capabilities',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}