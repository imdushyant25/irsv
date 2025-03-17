// File: lambda/enrichmentProcessor/processors/DrugLookUpProcessor.ts

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

/**
 * Rule processor for drug information lookup and enrichment
 */
export class DrugLookUpProcessor {
    name: string = 'Drug Lookup Processor';
    ruleId: string = '3f91e6c0-4b5a-4c9f-8e7d-5a8c6a7b5d4g';
    
    /**
     * Validates if the claim has the required fields for this rule
     */
    validate(claim: any): boolean {
      // Verify that the claim has an NDC11 value to lookup
      const hasNdc11 = Boolean(
        claim.mappedFields && 
        claim.mappedFields.ndc11 !== undefined && 
        claim.mappedFields.ndc11 !== null &&
        claim.mappedFields.ndc11 !== ''
      );
      
      // Check if we already have these fields mapped to avoid redundant processing
      const alreadyHasBrandGeneric = Boolean(claim.mappedFields?.brand_generic);
      const alreadyHasSpecialtyIndicator = Boolean(claim.mappedFields?.specialty_indicator);
      const alreadyHasPreventiveDrug = Boolean(claim.mappedFields?.preventive_drug);
      
      // Proceed if we have an NDC11 and at least one of the target fields is not already mapped
      return hasNdc11 && (!alreadyHasBrandGeneric || !alreadyHasSpecialtyIndicator || !alreadyHasPreventiveDrug);
    }
    
    /**
     * Processes the claim to enrich with drug information
     */
    async process(claim: any): Promise<any> {
      try {
        // Extract NDC11 from claim
        const ndc11 = claim.mappedFields.ndc11;
        
        // We'll use the global pool provided by the Lambda environment
        // This is similar to how the other processors would work
        
        // Query the drug_master table for the matching NDC11
        // The query will be executed within the same transaction already started by the Lambda handler
        const drugQuery = `
          SELECT 
            brand_generic,
            specialty_indicator,
            is_aca,
            is_hdhp
          FROM edpm.drug_master
          WHERE ndc11 = $1
          LIMIT 1
        `;
        
        const dbConfig = {
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          ssl: {
            rejectUnauthorized: false
          }
        };
        
        const { Client } = require('pg');
        const client = new Client(dbConfig);
        await client.connect();
        
        try {
          // Execute query
          const drugResult = await client.query(drugQuery, [ndc11]);
          
          // If no matching drug found, return early
          if (drugResult.rows.length === 0) {
            return {
              success: false,
              fieldName: 'drugLookupEnrichment',
              fieldValue: null,
              error: `No drug found with NDC11: ${ndc11}`
            };
          }
          
          // Extract the drug information
          const drug = drugResult.rows[0];
          
          // Prepare the enrichment data
          const enrichmentData: any = {};
          
          // Add brand_generic if not already mapped
          if (!claim.mappedFields.brand_generic && drug.brand_generic) {
            enrichmentData.brand_generic = drug.brand_generic;
          }
          
          // Add specialty_indicator if not already mapped
          if (!claim.mappedFields.specialty_indicator && drug.specialty_indicator) {
            enrichmentData.specialty_indicator = drug.specialty_indicator;
          }
          
          // Add preventive_drug flag if not already mapped and either is_aca or is_hdhp is true
          if (!claim.mappedFields.preventive_drug && (drug.is_aca === true || drug.is_hdhp === true)) {
            enrichmentData.preventive_drug = true;
          }
          
          // If no enrichment data was added, consider it a no-op success
          if (Object.keys(enrichmentData).length === 0) {
            return {
              success: true,
              fieldName: 'drugLookupEnrichment',
              fieldValue: null,
              message: `No new enrichment data for NDC11: ${ndc11}`
            };
          }
          
          // Return successful enrichment
          return {
            success: true,
            fieldName: 'drugLookupEnrichment',
            fieldValue: enrichmentData
          };
        } finally {
          // Make sure to close the client connection
          await client.end();
        }
      } catch (error) {
        // Handle any errors during processing
        return {
          success: false,
          fieldName: 'drugLookupEnrichment',
          fieldValue: null,
          error: error instanceof Error ? error.message : 'Unknown error during drug lookup'
        };
      }
    }
  }