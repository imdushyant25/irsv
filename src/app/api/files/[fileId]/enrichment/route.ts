// File: src/app/api/files/[fileId]/enrichment/route.ts (updated)

import { NextRequest, NextResponse } from 'next/server';
import { getEnrichmentService } from '@/services/enrichment/EnrichmentServiceFactory';
import { enrichmentRuleRegistry } from '@/services/enrichment/EnrichmentRuleRegistry';

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

    // Initialize the rule registry if not already done
    if (!enrichmentRuleRegistry.isInitialized()) {
      await enrichmentRuleRegistry.loadRules();
    }

    // Get the appropriate enrichment service based on feature flags
    const enrichmentService = getEnrichmentService();

    // Start the enrichment process
    const result = await enrichmentService.startEnrichment(
      fileId, 
      'system' // TODO: Replace with actual user ID once auth is implemented
    );

    return NextResponse.json({
      message: 'Enrichment process started',
      runId: result.runId
    });
  } catch (error) {
    console.error('Error starting enrichment:', error);
    return NextResponse.json(
      { 
        error: 'Failed to start enrichment process',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}