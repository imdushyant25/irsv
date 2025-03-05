// File: src/services/enrichment/rules/AgeRulesProcessor.ts
import { ClaimRecord, EnrichmentResult } from '@/types/enrichment';
import { BaseRuleProcessor } from './BaseRuleProcessor';

export class AgeRulesProcessor extends BaseRuleProcessor {
  constructor() {
    // Initialize with a fixed rule ID, name, and priority
    super('1e91e6c0-2b5a-4c9f-8e7d-5a8c6a7b5d4e', 'Age Classification Rule', 10);
  }

  /**
   * Validate if the claim has the required fields for age calculation
   * Strictly check for member_dob and fill_date only
   */
  validate(claim: ClaimRecord, parameters: any): boolean {
    // Check if the claim has the exact required fields
    const hasMemberDob = claim.mappedFields.member_dob !== undefined;
    const hasFillDate = claim.mappedFields.fill_date !== undefined;

    return hasMemberDob && hasFillDate;
  }

  /**
   * Process the claim and calculate age-related fields
   */
  async process(claim: ClaimRecord, parameters: any): Promise<EnrichmentResult> {
    try {
      // Extract required fields - we already validated they exist
      const dob = new Date(claim.mappedFields.member_dob);
      const fillDate = new Date(claim.mappedFields.fill_date);
      const currentDate = new Date(); // Today's date for current age calculation

      // Calculate age at time of fill date
      const ageAtFillDate = this.calculateAge(dob, fillDate);
      
      // Calculate current age
      const currentAge = this.calculateAge(dob, currentDate);

      // Return the calculated fields with the new required fields
      return this.createSuccessResult('ageEnrichment', {
        currentAge,              // Current age based on today's date
        ageAtFillDate,           // Age at the time of fill date
        isUnder65AtFillDate: ageAtFillDate < 65,  // Under 65 flag at fill date
        isUnder65AtCurrentDate: currentAge < 65   // Under 65 flag at current date
      });
    } catch (error) {
      return this.createErrorResult(
        'ageEnrichment', 
        error instanceof Error ? error.message : 'Failed to calculate age enrichment'
      );
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
}