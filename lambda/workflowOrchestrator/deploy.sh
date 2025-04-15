#!/bin/bash

# Build and deploy workflow orchestrator Lambda function

# Step 1: Install dependencies
echo "Installing dependencies..."
npm install

# Step 2: Build the TypeScript code
echo "Building TypeScript..."
npm run build

# Step 3: Create a deployment package
echo "Creating deployment package..."
mkdir -p dist/node_modules
cp -r node_modules/* dist/node_modules/

# Step 4: Create the deployment ZIP
echo "Creating deployment ZIP..."
cd dist
zip -r ../function.zip .
cd ..

# Step 5: Deploy to AWS Lambda (if AWS CLI is configured)
if [ -n "$1" ]; then
  # If a function name is provided as an argument, update the function
  echo "Deploying to Lambda function: $1..."
  aws lambda update-function-code \
    --function-name $1 \
    --zip-file fileb://function.zip

  # Update environment variables to include all processors
  echo "Updating environment variables for function: $1..."
  aws lambda update-function-configuration \
    --function-name $1 \
    --environment "Variables={DB_HOST=$DB_HOST,DB_PORT=$DB_PORT,DB_NAME=$DB_NAME,DB_USER=$DB_USER,DB_PASSWORD=$DB_PASSWORD,DB_SCHEMA=edpm,EXCLUSIONS_PROCESSOR_LAMBDA_NAME=exclusions-processor,FORMULARY_EXCLUSIONS_PROCESSOR_LAMBDA_NAME=formulary-exclusions-processor,WEIGHT_LOSS_SAVINGS_PROCESSOR_LAMBDA_NAME=weight-loss-savings-processor,DIABETES_PROCESSOR_LAMBDA_NAME=diabetes-processor,HDCR_PROCESSOR_LAMBDA_NAME=hdcr-processor,PRIOR_AUTH_PROCESSOR_LAMBDA_NAME=prior-auth-processor,QTY_LIMIT_PROCESSOR_LAMBDA_NAME=qty-limit-processor}"

  echo "Lambda function and environment variables updated successfully!"
else
  echo "Deployment package created: function.zip"
  echo "To deploy, run: ./deploy.sh YOUR_FUNCTION_NAME"
  echo "Example: ./deploy.sh illuminateRx-workflowOrchestrator"
fi