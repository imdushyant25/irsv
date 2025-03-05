// File: src/services/enrichment/rules/BaseRuleProcessor.ts
import { ClaimRecord, EnrichmentResult, EnrichmentRuleProcessor } from '@/types/enrichment';

export abstract class BaseRuleProcessor implements EnrichmentRuleProcessor {
  ruleId: string;
  name: string;
  priority: number;

  constructor(ruleId: string, name: string, priority: number) {
    this.ruleId = ruleId;
    this.name = name;
    this.priority = priority;
  }

  /**
   * Validate if the rule can be applied to the claim
   * Override this method in specific implementations
   */
  abstract validate(claim: ClaimRecord, parameters: any): boolean;

  /**
   * Process the rule and return the enrichment result
   * Override this method in specific implementations
   */
  abstract process(claim: ClaimRecord, parameters: any): Promise<EnrichmentResult>;

  /**
   * Helper method to create a successful result
   */
  protected createSuccessResult(fieldName: string, fieldValue: any): EnrichmentResult {
    return {
      success: true,
      fieldName,
      fieldValue
    };
  }

  /**
   * Helper method to create an error result
   */
  protected createErrorResult(fieldName: string, error: string): EnrichmentResult {
    return {
      success: false,
      fieldName,
      fieldValue: null,
      error
    };
  }
}