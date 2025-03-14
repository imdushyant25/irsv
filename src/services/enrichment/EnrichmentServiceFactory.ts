// File: src/services/enrichment/EnrichmentServiceFactory.ts

import { features } from '@/config/features';
import { enrichmentService } from './EnrichmentService';
import { lambdaEnrichmentService } from './LambdaEnrichmentService';

/**
 * Factory to get the appropriate enrichment service implementation
 * based on feature flags
 */
export function getEnrichmentService() {
  // If Lambda enrichment is enabled, use the Lambda implementation
  if (features.useLambdaProcessing && features.lambdaFeatures.enrichment) {
    console.log('Using Lambda enrichment service');
    return lambdaEnrichmentService;
  }
  
  // Otherwise, use the standard implementation
  console.log('Using standard enrichment service');
  return enrichmentService;
}