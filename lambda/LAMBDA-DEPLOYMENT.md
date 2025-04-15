# Lambda Deployment Guide

This document explains how to deploy the Lambda functions for the IlluminateRx workflow.

## Functions Overview

1. **workflowOrchestrator**: Coordinates the entire file processing workflow
2. **weightLossSavingsProcessor**: Performs weight loss medication savings analysis
3. **exclusionsProcessor**: Analyzes plan exclusions in claims data
4. **formularyExclusionsProcessor**: Analyzes formulary exclusions in claims data
5. **fileProcessor**: Processes initial file uploads
6. **enrichmentProcessor**: Enriches claims data with additional information

## Environment Variables

Each Lambda function requires the following environment variables:

```
DB_HOST=your-database-host
DB_PORT=5432
DB_NAME=your-database-name
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_SCHEMA=edpm
```

Additionally, the workflow orchestrator needs:

```
EXCLUSIONS_PROCESSOR_LAMBDA_NAME=exclusions-processor
FORMULARY_EXCLUSIONS_PROCESSOR_LAMBDA_NAME=formulary-exclusions-processor
WEIGHT_LOSS_SAVINGS_PROCESSOR_LAMBDA_NAME=weight-loss-savings-processor
```

## Deploying the Weight Loss and Workflow Functions

1. Set the required environment variables in your shell:

```bash
export DB_HOST=your-database-host
export DB_PORT=5432
export DB_NAME=your-database-name
export DB_USER=your-database-user
export DB_PASSWORD=your-database-password
```

2. Run the deployment script with Lambda function names:

```bash
./deploy-lambdas.sh illuminateRx-workflowOrchestrator weight-loss-savings-processor
```

## Deploying Individual Lambdas

Each Lambda has its own deployment script. To deploy just one function:

1. Navigate to the function's directory:

```bash
cd lambda/weightLossSavingsProcessor
```

2. Run the deployment script with the function name:

```bash
./deploy.sh weight-loss-savings-processor
```

## Troubleshooting

If the workflow is not progressing correctly:

1. Check CloudWatch logs for each Lambda function
2. Verify the environment variables are correctly set for each Lambda
3. Confirm database connectivity from the Lambda functions
4. Check the workflow_tracking table for the current workflow state

## Database Tables

The workflow primarily interacts with these tables:

- `claims_file_registry`: Tracks uploaded files
- `claim_records`: Stores the processed claim data
- `batch_processing_status`: Tracks enrichment batches
- `savings_results`: Stores results from savings analyses
- `workflow_tracking`: Tracks the overall workflow state