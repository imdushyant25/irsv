// File: src/types/opportunity.ts
export interface Opportunity {
    id: string;
    opportunityId: string;
    productId: string;
    employer: string;
    opportunityOwner: string | null;
    financialAnalyst: string | null;
    strategicPharmacyAnalyst: string | null;
    stageName: string | null;
    opportunityMetadata: Record<string, any>;
    createdBy: string;
    createdAt: Date;
    updatedBy: string | null;
    updatedAt: Date | null;
  }