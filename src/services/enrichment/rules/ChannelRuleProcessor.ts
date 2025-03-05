// File: src/services/enrichment/rules/ChannelRuleProcessor.ts
import { ClaimRecord, EnrichmentResult } from '@/types/enrichment';
import { BaseRuleProcessor } from './BaseRuleProcessor';

export class ChannelRuleProcessor extends BaseRuleProcessor {
  constructor() {
    // Initialize with a fixed rule ID, name, and priority (higher number = lower priority)
    // Since the Age rule has priority 10, we'll set this to 20
    super('2f91e6c0-3b5a-4c9f-8e7d-5a8c6a7b5d4f', 'Channel Classification Rule', 20);
  }

  /**
   * Validate if the claim has the required fields for channel determination
   * and that there's no existing channel_indicator mapping
   */
  validate(claim: ClaimRecord, parameters: any): boolean {
    if (!claim || !claim.mappedFields) {
      return false;
    }
    
    // Check if days_supply field exists and is not null or undefined
    const hasDaysSupply = claim.mappedFields.days_supply !== undefined && 
                          claim.mappedFields.days_supply !== null;
    
    // Check if channel_indicator is already mapped
    const hasChannelIndicator = claim.mappedFields.channel_indicator !== undefined;

    // Days supply should be convertible to a number
    let isValidDaysSupply = false;
    if (hasDaysSupply) {
      const daysSupply = Number(claim.mappedFields.days_supply);
      isValidDaysSupply = !isNaN(daysSupply) && daysSupply > 0;
    }

    // Return true only if days_supply is valid and channel_indicator doesn't exist
    return isValidDaysSupply && !hasChannelIndicator;
  }

  /**
   * Process the claim and determine channel indicator
   */
  async process(claim: ClaimRecord, parameters: any): Promise<EnrichmentResult> {
    try {
      // Parse days_supply as a number
      const daysSupply = Number(claim.mappedFields.days_supply);
      
      // Double-check validity (although validate should have already confirmed this)
      if (isNaN(daysSupply) || daysSupply <= 0) {
        return this.createErrorResult(
          'channelEnrichment',
          `Invalid days_supply value: ${claim.mappedFields.days_supply}`
        );
      }

      // Determine channel based on days_supply
      let channel: string;
      if (daysSupply > 83) {
        channel = "Mail";
      } else if (daysSupply <= 30) {
        channel = "Retail";
      } else {
        // For values between 31-83, we consider it Retail90
        channel = "Retail90";
      }

      // Return the derived channel
      return this.createSuccessResult('channelEnrichment', {
        channel_indicator: channel,
        derived_from_days_supply: daysSupply
      });
    } catch (error) {
      return this.createErrorResult(
        'channelEnrichment',
        error instanceof Error ? error.message : 'Failed to calculate channel enrichment'
      );
    }
  }
}