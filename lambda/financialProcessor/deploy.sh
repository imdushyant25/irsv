#!/bin/bash

# Build and deploy Financial Processor Lambda function

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
  
  # Check if the function exists
  aws lambda get-function --function-name $1 > /dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    # Function exists, update it
    echo "Updating existing function: $1..."
    aws lambda update-function-code \
      --function-name $1 \
      --zip-file fileb://function.zip

    # Set environment variables for database connection
    echo "Updating environment variables for function: $1..."
    aws lambda update-function-configuration \
      --function-name $1 \
      --environment "Variables={DB_HOST=$DB_HOST,DB_PORT=$DB_PORT,DB_NAME=$DB_NAME,DB_USER=$DB_USER,DB_PASSWORD=$DB_PASSWORD,DB_SCHEMA=edpm}"

    echo "Lambda function updated successfully!"
  else
    # Function doesn't exist, create it
    echo "Creating new function: $1..."
    aws lambda create-function \
      --function-name $1 \
      --runtime nodejs18.x \
      --handler index.handler \
      --zip-file fileb://function.zip \
      --role arn:aws:iam::795885070747:role/claims-lambda-execution-role \
      --timeout 300 \
      --memory-size 512 \
      --environment "Variables={DB_HOST=$DB_HOST,DB_PORT=$DB_PORT,DB_NAME=$DB_NAME,DB_USER=$DB_USER,DB_PASSWORD=$DB_PASSWORD,DB_SCHEMA=edpm}"

    echo "Lambda function created successfully!"
  fi
else
  echo "Deployment package created: function.zip"
  echo "To deploy, run: ./deploy.sh YOUR_FUNCTION_NAME"
  echo "Example: ./deploy.sh financial-processor"
fi