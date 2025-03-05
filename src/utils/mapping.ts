// File: src/utils/mapping.ts
import { StandardField } from '@/types/mapping';
import { calculateStringSimilarity } from './string';

/**
 * Normalizes a string for field comparison by:
 * 1. Converting to uppercase
 * 2. Removing spaces, hyphens, and underscores
 */
export function normalizeFieldName(field: string): string {
  return field.toUpperCase().replace(/[\s\-_]/g, '');
}

/**
 * Map of normalized standard field names to their variations
 */
interface FieldVariation {
  standardFieldId: string;
  normalizedName: string;
  originalName: string;
}

/**
 * Interface for the results of auto-mapping
 */
export interface AutoMapResult {
  exactMatches: number;
  variationMatches: number;
  similarityMatches: number;
  mapping: Record<string, string>;
}

/**
 * Automatically maps source headers to standard fields using multiple strategies:
 * 1. Exact matching with normalized field names
 * 2. Matching against known field variations
 * 3. Similarity-based matching for remaining fields
 * 
 * @param sourceHeaders Excel file headers
 * @param standardFields Available standard fields
 * @param fieldVariations Variations of standard fields from database
 * @param similarityThreshold Threshold for similarity matching (0-1)
 * @returns The mapping result with statistics
 */
export async function intelligentAutoMap(
  sourceHeaders: string[],
  standardFields: StandardField[],
  fieldVariations: Array<{id: string, standard_field_id: string, variation_name: string}>,
  similarityThreshold = 0.8
): Promise<AutoMapResult> {
  const result: AutoMapResult = {
    exactMatches: 0,
    variationMatches: 0,
    similarityMatches: 0,
    mapping: {}
  };

  // Normalize all standard fields
  const normalizedStandardFields = standardFields.map(field => ({
    id: field.id,
    originalName: field.fieldName,
    normalizedName: normalizeFieldName(field.fieldName)
  }));

  // Create a lookup map for variations
  const variations: FieldVariation[] = fieldVariations.map(variation => ({
    standardFieldId: variation.standard_field_id,
    originalName: variation.variation_name,
    normalizedName: normalizeFieldName(variation.variation_name)
  }));

  // Process each source header
  for (const header of sourceHeaders) {
    const normalizedHeader = normalizeFieldName(header);
    let matched = false;

    // 1. Try exact match with normalized standard field names
    const exactMatch = normalizedStandardFields.find(
      field => field.normalizedName === normalizedHeader
    );
    
    if (exactMatch) {
      result.mapping[header] = exactMatch.id;
      result.exactMatches++;
      matched = true;
      continue;
    }

    // 2. Try matching against known variations
    const variationMatch = variations.find(
      variation => variation.normalizedName === normalizedHeader
    );
    
    if (variationMatch) {
      result.mapping[header] = variationMatch.standardFieldId;
      result.variationMatches++;
      matched = true;
      continue;
    }

    // 3. For remaining fields, try similarity-based matching
    // Only consider fields that haven't been mapped yet
    const mappedFieldIds = Object.values(result.mapping);
    const unmappedFields = standardFields.filter(
      field => !mappedFieldIds.includes(field.id)
    );
    
    if (unmappedFields.length > 0) {
      // Calculate similarity scores
      const scores = unmappedFields.map(field => {
        // Try matching with the field name
        const fieldNameScore = calculateStringSimilarity(
          normalizedHeader, 
          normalizeFieldName(field.fieldName)
        );
        
        // Try matching with the display name
        const displayNameScore = calculateStringSimilarity(
          normalizedHeader, 
          normalizeFieldName(field.displayName)
        );
        
        // Get the best score
        const bestScore = Math.max(fieldNameScore, displayNameScore);
        
        return {
          field,
          score: bestScore
        };
      });
      
      // Find the best match above the threshold
      const bestMatch = scores.reduce(
        (best, current) => current.score > best.score ? current : best,
        { field: null as StandardField | null, score: 0 }
      );
      
      if (bestMatch.field && bestMatch.score >= similarityThreshold) {
        result.mapping[header] = bestMatch.field.id;
        result.similarityMatches++;
        matched = true;
      }
    }
  }
  
  return result;
}