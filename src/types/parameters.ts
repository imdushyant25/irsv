// File: src/components/parameters/types/parameters.ts

export interface FormularyParameters {
    formulary: string;
  }

  export type RebateType = 'useFromClaims' | 'perClaim' | 'lumpSum';

  export interface PerClaimRebates {
    nonSpecialtyBrand30DS: string;
    nonSpecialtyBrand90DS: string;
    nonSpecialtyMailBrand: string;
    specialtyBrand: string;
  }

  export interface LumpSumRebates {
    amount: string;
    nonSpecialtyBrandPercentage: string;
    specialtyBrandPercentage: string;
  }

  
  export interface PlanExclusions {
    lcv_wow: boolean;
    medical_benefit_only: boolean;
    desi: boolean;
    otc_drug_ind: boolean;
    abortifacient: boolean;
    weight_loss_inj: boolean;
    weight_loss_oral: boolean; 
    fertility: boolean;
    growth_hormone: boolean;
    questionable_clinical_effectiveness: boolean;
  }
  
  export interface DawPenalties {
    daw1: boolean;
    daw2: boolean;
  }
  
  export interface RebateBreakdown {
    retailBrand30: string;
    retailBrand90: string;
    mailBrand: string;
    specialtyBrand: string;
    lumpSum: string;
  }
  
  export interface RebateConfig {
  type: RebateType;
  perClaimRebates?: PerClaimRebates;
  lumpSumRebates?: LumpSumRebates;
}
  
export interface RebatesParameters {
  incumbent: RebateConfig;
  fourthPbm: RebateConfig;
}
  
  export interface AdminFees {
    perClaim: string;
    illuminateRx: string;
  }
  
  export interface FeatureFlags {
    mcap: boolean;
    pap: boolean;
    ids: boolean;
    hans: boolean;
  }

  export interface UserDefinedCopay {
    retail30Generic: string;
    retail30PreferredBrand: string;
    retail30NonPreferredBrand: string;
    retail90Generic: string;
    retail90PreferredBrand: string;
    retail90NonPreferredBrand: string;
    mailGeneric: string;
    mailPreferredBrand: string;
    mailNonPreferredBrand: string;
    specialtyGeneric: string;
    specialtyPreferredBrand: string;
    specialtyNonPreferredBrand: string;
  }

  export interface IlluminateRxStandardCopay {
    retail30Generic: string;
    retail30Brand: string;
    retail90Generic: string;
    retail90Brand: string;
    mailGeneric: string;
    mailBrand: string;
    specialtyBrand: string;
  }

  export interface MemberCopays {
    nsRetailGeneric30: string;
    nsRetailPreferredBrand30: string;
    nsRetailNonPreferredBrand30: string;
    nsRetailGeneric90: string;
    nsRetailPreferredBrand90: string;
    nsRetailNonPreferredBrand90: string;
    nsMailGeneric90: string;
    nsMailPreferredBrand90: string;
    nsMailNonPreferredBrand90: string;
    specialtyGeneric: string;
    specialtyPreferredBrand: string;
    specialtyNonPreferredBrand: string;
  }

  export interface CoinsuranceAmount {
    percentage: string;
    maximum: string;
  }
  
  export interface MemberCoinsurance {
    nsRetailGeneric30: CoinsuranceAmount;
    nsRetailPreferredBrand30: CoinsuranceAmount;
    nsRetailNonPreferredBrand30: CoinsuranceAmount;
    nsRetailGeneric90: CoinsuranceAmount;
    nsRetailPreferredBrand90: CoinsuranceAmount;
    nsRetailNonPreferredBrand90: CoinsuranceAmount;
    nsMailGeneric90: CoinsuranceAmount;
    nsMailPreferredBrand90: CoinsuranceAmount;
    nsMailNonPreferredBrand90: CoinsuranceAmount;
    specialtyGeneric: CoinsuranceAmount;
    specialtyPreferredBrand: CoinsuranceAmount;
    specialtyNonPreferredBrand: CoinsuranceAmount;
  }

  export interface CopayModelingParameters {
    modelingType: 'useClaimsFile' | 'memberCopays' | 'memberCoinsurance';
    memberCopays?: MemberCopays;
    memberCoinsurance?: MemberCoinsurance;
  }

  
  export interface GeneralInformation {
    formulary: string;
    planExclusions: PlanExclusions;
    dawPenalties: DawPenalties;
    rebates: RebatesParameters;
    dispensingFee: string;
    flags: FeatureFlags;
    adminFees: AdminFees;
    cotRate: string;
    copayModeling: CopayModelingParameters;
  }
  
  export type SectionChangeHandler<T> = (value: T) => void;