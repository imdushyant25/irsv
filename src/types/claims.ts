// File: src/types/claims.ts

/**
 * Represents a claim record in the system
 */
export interface ClaimRecord {
    recordId: string;
    fileId: string;
    rowNumber: number;
    mappedFields: Record<string, any>;
    unmappedFields: Record<string, any>;
    dynamicFields?: Record<string, any>;
    validationStatus: string;
    processingStatus: string;
    createdBy: string;
    createdAt: Date;
    updatedBy?: string;
    updatedAt?: Date;
  }
  
  /**
   * Enum for claim validation status
   */
  export enum ClaimValidationStatus {
    VALID = 'VALID',
    INVALID = 'INVALID',
    WARNING = 'WARNING',
    PENDING_VALIDATION = 'PENDING_VALIDATION'
  }
  
  /**
   * Enum for claim processing status
   */
  export enum ClaimProcessingStatus {
    PENDING = 'PENDING',
    PROCESSED = 'PROCESSED',
    FAILED = 'FAILED',
    NEEDS_REVIEW = 'NEEDS_REVIEW'
  }
  
  /**
   * Interface for claim processing results
   */
  export interface ClaimProcessingResult {
    success: boolean;
    validationStatus: ClaimValidationStatus;
    processingStatus: ClaimProcessingStatus;
    errors?: string[];
    warnings?: string[];
  }