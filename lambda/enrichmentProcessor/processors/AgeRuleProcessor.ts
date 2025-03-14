// File: lambda/enrichmentProcessor/processors/AgeRuleProcessor.ts

/**
 * Rule processor for calculating age-related enrichments
 */
export class AgeRuleProcessor {
    name: string = 'Age Rule Processor';
    ruleId: string = '1e91e6c0-2b5a-4c9f-8e7d-5a8c6a7b5d4e';
    
    /**
     * Validates if the claim has the required fields for this rule
     */
    validate(claim: any): boolean {
      return Boolean(
        claim.mappedFields &&
        claim.mappedFields.member_dob && 
        (claim.mappedFields.fill_date || claim.mappedFields.service_date)
      );
    }
    
    /**
     * Processes the claim to calculate age-related fields
     */
    async process(claim: any): Promise<any> {
      try {
        // Extract required fields
        const dob = new Date(claim.mappedFields.member_dob);
        
        // Use fill_date if available, otherwise use service_date
        const eventDate = claim.mappedFields.fill_date 
          ? new Date(claim.mappedFields.fill_date)
          : new Date(claim.mappedFields.service_date);
        
        const today = new Date();
        
        // Validate dates
        if (isNaN(dob.getTime())) {
          return {
            success: false,
            fieldName: 'ageEnrichment',
            fieldValue: null,
            error: `Invalid date of birth: ${claim.mappedFields.member_dob}`
          };
        }
        
        if (isNaN(eventDate.getTime())) {
          return {
            success: false,
            fieldName: 'ageEnrichment',
            fieldValue: null,
            error: `Invalid event date: ${claim.mappedFields.fill_date || claim.mappedFields.service_date}`
          };
        }
        
        // Calculate ages
        const ageAtEvent = this.calculateAge(dob, eventDate);
        const currentAge = this.calculateAge(dob, today);
        
        // Create the enrichment data
        return {
          success: true,
          fieldName: 'ageEnrichment',
          fieldValue: {
            currentAge,
            ageAtEvent,
            isUnder65: ageAtEvent < 65,
            isUnder65Now: currentAge < 65,
            ageGroup: this.getAgeGroup(ageAtEvent),
            calculatedAt: today.toISOString()
          }
        };
      } catch (error) {
        return {
          success: false,
          fieldName: 'ageEnrichment',
          fieldValue: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
    
    /**
     * Calculate age between two dates
     */
    private calculateAge(dob: Date, referenceDate: Date): number {
      let age = referenceDate.getFullYear() - dob.getFullYear();
      const m = referenceDate.getMonth() - dob.getMonth();
      
      if (m < 0 || (m === 0 && referenceDate.getDate() < dob.getDate())) {
        age--;
      }
      
      return age;
    }
    
    /**
     * Get age group based on age
     */
    private getAgeGroup(age: number): string {
      if (age < 18) return '0-17';
      if (age < 30) return '18-29';
      if (age < 40) return '30-39';
      if (age < 50) return '40-49';
      if (age < 65) return '50-64';
      if (age < 75) return '65-74';
      return '75+';
    }
  }