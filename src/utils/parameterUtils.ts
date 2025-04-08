// File: src/utils/parameterUtils.ts

import { 
  RebateConfig, 
  RebateType,
  PerClaimRebates,
  LumpSumRebates,
  GeneralInformation, 
  DawPenalties 
} from '../types/parameters';

/**
 * Validates rebate values are valid numbers
 * @param rebate The rebate configuration object to validate
 * @returns True if all values are valid numbers (or empty)
 */
export const validateRebateValues = (rebate: RebateConfig): boolean => {
  if (rebate.type === 'lumpSum' && rebate.lumpSumRebates) {
    return isValidNumber(rebate.lumpSumRebates.amount) || !rebate.lumpSumRebates.amount;
  }

  if (rebate.type === 'perClaim' && rebate.perClaimRebates) {
    // Allow empty values or valid numbers
    return (
      (isValidNumber(rebate.perClaimRebates.nonSpecialtyBrand30DS) || !rebate.perClaimRebates.nonSpecialtyBrand30DS) &&
      (isValidNumber(rebate.perClaimRebates.nonSpecialtyBrand90DS) || !rebate.perClaimRebates.nonSpecialtyBrand90DS) &&
      (isValidNumber(rebate.perClaimRebates.nonSpecialtyMailBrand) || !rebate.perClaimRebates.nonSpecialtyMailBrand) &&
      (isValidNumber(rebate.perClaimRebates.specialtyBrand) || !rebate.perClaimRebates.specialtyBrand)
    );
  }

  return true;
};

/**
 * Checks if a string is a valid positive number
 * @param value String value to check
 * @returns True if the string represents a valid non-negative number
 */
export const isValidNumber = (value?: string): boolean => {
  if (!value) return false;
  
  // Allow any number format with any decimal precision
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0;
};

/**
 * Default values for the rebate nested objects
 */
const defaultPerClaimRebates: PerClaimRebates = {
  nonSpecialtyBrand30DS: '',
  nonSpecialtyBrand90DS: '',
  nonSpecialtyMailBrand: '',
  specialtyBrand: ''
};

const defaultLumpSumRebates: LumpSumRebates = {
  amount: '',
  nonSpecialtyBrandPercentage: '',
  specialtyBrandPercentage: ''
};

/**
 * Returns a default general information object with empty/default values
 */
export const getDefaultGeneralInformation = (): GeneralInformation => ({
  formulary: '',
  planExclusions: {
    lcv_wow: true,
    medical_benefit_only: false,
    desi: false,
    otc_drug_ind: false,
    abortifacient: false,
    weight_loss_inj: false,
    weight_loss_oral: false,
    fertility: false,
    growth_hormone: false,
    questionable_clinical_effectiveness: false
  },
  dawPenalties: {
    daw1: false,
    daw2: false
  },
  rebates: {
    incumbent: {
      type: 'useFromClaims',
      perClaimRebates: { ...defaultPerClaimRebates },
      lumpSumRebates: { ...defaultLumpSumRebates }
    },
    fourthPbm: {
      type: 'useFromClaims',
      perClaimRebates: { ...defaultPerClaimRebates },
      lumpSumRebates: { ...defaultLumpSumRebates }
    }
  },
  dispensingFee: '',
  flags: {
    mcap: false,
    pap: false,
    ids: false,
    hans: false
  },
  adminFees: {
    perClaim: '',
    illuminateRx: ''
  },
  cotRate: '',
  copayModeling: {
    modelingType: 'useClaimsFile',
    memberCopays: {
      nsRetailGeneric30: '',
      nsRetailPreferredBrand30: '',
      nsRetailNonPreferredBrand30: '',
      nsRetailGeneric90: '',
      nsRetailPreferredBrand90: '',
      nsRetailNonPreferredBrand90: '',
      nsMailGeneric90: '',
      nsMailPreferredBrand90: '',
      nsMailNonPreferredBrand90: '',
      specialtyGeneric: '',
      specialtyPreferredBrand: '',
      specialtyNonPreferredBrand: '',
    },
    memberCoinsurance: {
      nsRetailGeneric30: { percentage: '', maximum: '' },
      nsRetailPreferredBrand30: { percentage: '', maximum: '' },
      nsRetailNonPreferredBrand30: { percentage: '', maximum: '' },
      nsRetailGeneric90: { percentage: '', maximum: '' },
      nsRetailPreferredBrand90: { percentage: '', maximum: '' },
      nsRetailNonPreferredBrand90: { percentage: '', maximum: '' },
      nsMailGeneric90: { percentage: '', maximum: '' },
      nsMailPreferredBrand90: { percentage: '', maximum: '' },
      nsMailNonPreferredBrand90: { percentage: '', maximum: '' },
      specialtyGeneric: { percentage: '', maximum: '' },
      specialtyPreferredBrand: { percentage: '', maximum: '' },
      specialtyNonPreferredBrand: { percentage: '', maximum: '' },
    }
  }
});

/**
 * Merges a partial object with default values
 * @param defaultObj The default object with complete structure
 * @param partialObj The partial object that may be missing properties
 * @returns A complete object with all properties
 */
export function mergeWithDefaults<T>(defaultObj: T, partialObj?: Partial<T>): T {
  if (!partialObj) return { ...defaultObj };
  
  const result = { ...defaultObj };
  
  // Loop through all properties of the partial object
  Object.keys(partialObj).forEach(key => {
    const typedKey = key as keyof T;
    const defaultValue = defaultObj[typedKey];
    const partialValue = partialObj[typedKey];
    
    // If both values are objects and not arrays, recursively merge them
    if (
      typeof defaultValue === 'object' &&
      defaultValue !== null &&
      !Array.isArray(defaultValue) &&
      typeof partialValue === 'object' &&
      partialValue !== null &&
      !Array.isArray(partialValue)
    ) {
      // @ts-ignore: We're checking types at runtime
      result[typedKey] = mergeWithDefaults(defaultValue, partialValue);
    } else if (partialValue !== undefined) {
      // Otherwise, use the partial value if it exists
      // @ts-ignore: We're checking existence at runtime
      result[typedKey] = partialValue;
    }
  });
  
  return result;
}

/**
 * Convert legacy rebate format to new structure
 * @param rebate The old format rebate object
 * @returns A rebate object in the new format
 */
export function convertLegacyRebateFormat(rebate: any): RebateConfig {
  if (!rebate) {
    return {
      type: 'useFromClaims',
      perClaimRebates: { ...defaultPerClaimRebates },
      lumpSumRebates: { ...defaultLumpSumRebates }
    };
  }
  
  // Check if it's already in the new format
  if (rebate.perClaimRebates || rebate.lumpSumRebates) {
    return {
      type: rebate.type || 'useFromClaims',
      perClaimRebates: rebate.perClaimRebates ? 
        { ...defaultPerClaimRebates, ...rebate.perClaimRebates } : 
        { ...defaultPerClaimRebates },
      lumpSumRebates: rebate.lumpSumRebates ? 
        { ...defaultLumpSumRebates, ...rebate.lumpSumRebates } : 
        { ...defaultLumpSumRebates }
    };
  }
  
  // Convert from old format
  return {
    type: rebate.type || 'useFromClaims',
    perClaimRebates: {
      nonSpecialtyBrand30DS: rebate.retailBrand30 || '',
      nonSpecialtyBrand90DS: rebate.retailBrand90 || '',
      nonSpecialtyMailBrand: rebate.mailBrand || '',
      specialtyBrand: rebate.specialtyBrand || ''
    },
    lumpSumRebates: {
      amount: rebate.lumpSum || '',
      nonSpecialtyBrandPercentage: rebate.retailBrand30 || '',
      specialtyBrandPercentage: rebate.specialtyBrand || ''
    }
  };
}

/**
 * Validates the general information object
 * @param parameters The general information object to validate
 * @returns True if the object is valid
 */
export const validateGeneralInformation = (parameters: GeneralInformation): boolean => {
  // Validate required fields based on the form's requirements
  
  // Validate rebates based on selected type
  if (parameters.rebates) {
    // Validate incumbent
    if (parameters.rebates.incumbent) {
      if (!validateRebateValues(parameters.rebates.incumbent)) {
        return false;
      }
    }
    
    // Validate fourthPbm
    if (parameters.rebates.fourthPbm) {
      if (!validateRebateValues(parameters.rebates.fourthPbm)) {
        return false;
      }
    }
  }
  
  // Add more validation logic as needed for other sections
  
  return true;
};