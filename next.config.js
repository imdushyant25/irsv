// File: next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    env: {
      // Rename environment variables to avoid AWS_ prefix conflicts
      CUSTOM_AWS_REGION: process.env.AWS_REGION,
      CUSTOM_AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      CUSTOM_AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      CUSTOM_AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
      // Add Lambda function names
      FILE_PROCESSOR_LAMBDA_NAME: process.env.FILE_PROCESSOR_LAMBDA_NAME || 'file-processor',
      ENRICHMENT_LAMBDA_NAME: process.env.ENRICHMENT_LAMBDA_NAME || 'enrichment-processor',
      EXCLUSIONS_PROCESSOR_LAMBDA_NAME: process.env.EXCLUSIONS_PROCESSOR_LAMBDA_NAME || 'exclusions-processor'
    },
  }
  
  module.exports = nextConfig