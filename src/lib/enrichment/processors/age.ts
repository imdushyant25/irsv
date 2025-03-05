// File: src/lib/enrichment/processors/age.ts

import { BaseProcessor, EnrichmentResult, ProcessorConfig } from '../registry';
import { ClaimRecord } from '@/types/claims';

export class AgeRuleProcessor extends BaseProcessor {
  constructor(config: ProcessorConfig) {
    super(config);
  }

  validate(parameters: any): boolean {
    // Check if required fields are mapped in the claims
    return true;
  }

  async process(claim: ClaimRecord, parameters: any): Promise<EnrichmentResult> {
    try {
      // Check for required fields
      if (!claim.mappedFields.member_dob) {
        return {
          success: false,
          error: 'Missing member date of birth',
          errorDetails: {
            claim_id: claim.recordId,
            fields_present: Object.keys(claim.mappedFields)
          }
        };
      }

      // Parse dates
      const memberDOB = new Date(claim.mappedFields.member_dob);
      const serviceDate = claim.mappedFields.service_date ? 
        new Date(claim.mappedFields.service_date) : 
        new Date(); // Use current date if service date not available
      const today = new Date();

      // Validate dates
      if (isNaN(memberDOB.getTime())) {
        return {
          success: false,
          error: 'Invalid member date of birth',
          errorDetails: {
            value: claim.mappedFields.member_dob,
            claim_id: claim.recordId
          }
        };
      }

      if (isNaN(serviceDate.getTime())) {
        return {
          success: false,
          error: 'Invalid service date',
          errorDetails: {
            value: claim.mappedFields.service_date,
            claim_id: claim.recordId
          }
        };
      }

      // Calculate ages
      const currentAge = this.calculateAge(memberDOB, today);
      const ageAtService = this.calculateAge(memberDOB, serviceDate);

      // Validate calculated ages
      if (currentAge < 0 || ageAtService < 0) {
        return {
          success: false,
          error: 'Invalid age calculation',
          errorDetails: {
            currentAge,
            ageAtService,
            member_dob: memberDOB.toISOString(),
            service_date: serviceDate.toISOString(),
            claim_id: claim.recordId
          }
        };
      }

      return {
        success: true,
        fields: {
          age_classification: {
            under_65: currentAge < 65,
            current_age: currentAge,
            age_at_service: ageAtService,
            age_group: this.getAgeGroup(ageAtService),
            dob: memberDOB.toISOString(),
            calculated_at: today.toISOString()
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: 'Age calculation failed',
        errorDetails: {
          message: error instanceof Error ? error.message : 'Unknown error',
          claim_id: claim.recordId,
          stack: error instanceof Error ? error.stack : undefined
        }
      };
    }
  }

  private calculateAge(birthDate: Date, currentDate: Date): number {
    let age = currentDate.getFullYear() - birthDate.getFullYear();
    const monthDiff = currentDate.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && currentDate.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }

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

// Register the processor
import { processorRegistry } from '../registry';
processorRegistry.register('AgeRuleProcessor', AgeRuleProcessor);