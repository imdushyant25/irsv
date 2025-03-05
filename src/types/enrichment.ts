// File: src/types/enrichment.ts
export interface ClaimRecord {
    recordId: string;
    mappedFields: Record<string, any>;
    unmappedFields: Record<string, any>;
    dynamicFields?: Record<string, any>;
    // Other claim properties
  }
  
  export interface EnrichmentResult {
    success: boolean;
    fieldName: string;
    fieldValue: any;
    error?: string;
  }
  
  export interface EnrichmentRuleProcessor {
    ruleId: string;
    name: string;
    priority: number;
    validate(claim: ClaimRecord, parameters: any): boolean;
    process(claim: ClaimRecord, parameters: any): Promise<EnrichmentResult>;
  }
  
  export enum EnrichmentStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    ERROR = 'ERROR'
  }
  
  export interface EnrichmentRun {
    runId: string;
    fileId: string;
    startedAt: Date;
    completedAt?: Date;
    totalRecords: number;
    enrichedRecords: number;
    failedRecords: number;
    status: EnrichmentStatus;
    createdBy: string;
    createdAt: Date;
    updatedBy?: string;
    updatedAt?: Date;
  }
  
  export interface EnrichmentRule {
    id: string;
    name: string;
    type: string;
    priority: number;
    processorClass: string;
    parameters: Record<string, any>;
    isActive: boolean;
    createdBy: string;
    createdAt: Date;
    updatedBy?: string;
    updatedAt?: Date;
  }