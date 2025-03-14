// File: lambda/enrichmentProcessor/processors/ChannelRuleProcessor.ts

/**
 * Rule processor for determining channel information
 */
export class ChannelRuleProcessor {
    name: string = 'Channel Rule Processor';
    ruleId: string = '2f91e6c0-3b5a-4c9f-8e7d-5a8c6a7b5d4f';
    
    /**
     * Validates if the claim has the required fields for this rule
     */
    validate(claim: any): boolean {
      // Ensure days_supply exists and there's no existing channel_indicator
      const hasDaysSupply = Boolean(
        claim.mappedFields && 
        claim.mappedFields.days_supply !== undefined && 
        claim.mappedFields.days_supply !== null
      );
      
      // Don't overwrite if channel is already mapped
      const hasChannelIndicator = Boolean(
        claim.mappedFields && 
        claim.mappedFields.channel_indicator
      );
      
      // Validate days_supply is a valid number
      let isValidDaysSupply = false;
      if (hasDaysSupply) {
        const daysSupply = Number(claim.mappedFields.days_supply);
        isValidDaysSupply = !isNaN(daysSupply) && daysSupply > 0;
      }
      
      return isValidDaysSupply && !hasChannelIndicator;
    }
    
    /**
     * Processes the claim to determine channel information
     */
    async process(claim: any): Promise<any> {
      try {
        // Parse days_supply as a number
        const daysSupply = Number(claim.mappedFields.days_supply);
        
        // Double-check validity (although validate should have already confirmed this)
        if (isNaN(daysSupply) || daysSupply <= 0) {
          return {
            success: false,
            fieldName: 'channelEnrichment',
            fieldValue: null,
            error: `Invalid days_supply value: ${claim.mappedFields.days_supply}`
          };
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
        return {
          success: true,
          fieldName: 'channelEnrichment',
          fieldValue: {
            channelIndicator: channel,
            derivedFromDaysSupply: daysSupply
          }
        };
      } catch (error) {
        return {
          success: false,
          fieldName: 'channelEnrichment',
          fieldValue: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  }