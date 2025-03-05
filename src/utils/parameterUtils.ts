// File: src/utils/parameterUtils.ts

import { RebateConfig, GeneralInformation, DawPenalties } from '../types/parameters';

/**
 * Validates rebate values are valid numbers
 * @param rebate The rebate configuration object to validate
 * @returns True if all values are valid numbers (or empty)
 */

export const validateRebateValues = (rebate: RebateConfig): boolean => {
  if (rebate.type === 'lumpSum') {
    return isValidNumber(rebate.lumpSum) || !rebate.lumpSum;
  }

  if (rebate.type === 'detailed') {
    // Allow empty values or valid numbers
    return (
      (isValidNumber(rebate.retailBrand30) || !rebate.retailBrand30) &&
      (isValidNumber(rebate.retailBrand90) || !rebate.retailBrand90) &&
      (isValidNumber(rebate.mailBrand) || !rebate.mailBrand) &&
      (isValidNumber(rebate.specialtyBrand) || !rebate.specialtyBrand)
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
 * Returns a default general information object with empty/default values
 */
export const getDefaultGeneralInformation = (): GeneralInformation => ({
  formulary: '',
  planExclusions: {
    lcvWowExclusions: true,
    medicalBenefitsExclusions: false,
    desiDrugs: false,
    otcDrugs: false,
    compoundedMedications: false,
    abortifacients: false,
    glp1Weightloss: false,
    weightlossNonGlp1: false,
    fertility: false,
    growthHormone: false,
    questionableClinicalEffectiveness: false
  },
  dawPenalties: {
    daw1: false,
    daw2: false
  },
  rebates: {
    incumbent: {
      type: 'detailed',
      retailBrand30: '',
      retailBrand90: '',
      mailBrand: '',
      specialtyBrand: '',
      lumpSum: ''
    },
    fourthPbm: {
      type: 'contractTerms',
      useContractTerms: true,
      retailBrand30: '',
      retailBrand90: '',
      mailBrand: '',
      specialtyBrand: '',
      lumpSum: ''
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
  // Add default values for copay modeling
  copayModeling: {
    modelingType: 'illuminateRxStandards',
    illuminateRxStandards: {
      retail30Generic: '30% max $ 150',
      retail30Brand: '30% max $ 150',
      retail90Generic: '30% max $ 450',
      retail90Brand: '30% max $ 450',
      mailGeneric: '30% max $ 450',
      mailBrand: '30% max $ 450',
      specialtyBrand: '30% max $ 1000'
    }
  }
});

/**
 * Validates the general information object
 * @param parameters The general information object to validate
 * @returns True if the object is valid
 */
export const validateGeneralInformation = (parameters: GeneralInformation): boolean => {
  // Add parameter validation logic here
  return true;
};