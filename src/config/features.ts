// File: src/config/features.ts

/**
 * Feature flags to control application behavior
 * Used for gradually rolling out new features or infrastructure changes
 */
export const features = {
    /**
     * Controls whether file processing uses AWS Lambda
     * When false, uses the local processing implementation
     * When true, delegates processing to Lambda functions
     */
    useLambdaProcessing: process.env.USE_LAMBDA_PROCESSING === 'true',
    
    /**
     * Controls which specific processing steps use Lambda
     * This allows granular control during the migration
     */
    lambdaFeatures: {
      fileProcessing: process.env.USE_LAMBDA_FILE_PROCESSING === 'true' || false,
      claimsProcessing: process.env.USE_LAMBDA_CLAIMS_PROCESSING === 'true' || false,
      enrichment: process.env.USE_LAMBDA_ENRICHMENT === 'true' || false
    }
  };