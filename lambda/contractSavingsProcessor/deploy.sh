#!/bin/bash

# Build and deploy Contract Savings Processor Lambda function

# Colors for console output
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
NOCOLOR="\033[0m"

# Clean up any previous build artifacts
echo -e "${YELLOW}Cleaning up previous build artifacts...${NOCOLOR}"
rm -rf dist/node_modules
rm -f function.zip

# Step 1: Install dependencies
echo -e "${YELLOW}Installing dependencies...${NOCOLOR}"
npm install

# Step 2: Build the TypeScript code
echo -e "${YELLOW}Building TypeScript...${NOCOLOR}"
npm run build

# Step 3: Set up deployment package structure
echo -e "${YELLOW}Setting up deployment package...${NOCOLOR}"
mkdir -p dist/node_modules
cp -r node_modules/* dist/node_modules/

# Step 4: Create the deployment ZIP
echo -e "${YELLOW}Creating deployment ZIP...${NOCOLOR}"
cd dist
zip -r ../function.zip .
cd ..

# Step 5: Deploy to AWS Lambda (if a function name is provided)
if [ -n "$1" ]; then
  # If a function name is provided as an argument, update the function
  FUNCTION_NAME=$1
  echo -e "${YELLOW}Deploying to Lambda function: ${FUNCTION_NAME}...${NOCOLOR}"
  
  # Check if the function exists
  aws lambda get-function --function-name ${FUNCTION_NAME} > /dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    # Update existing function
    echo -e "${YELLOW}Updating existing function...${NOCOLOR}"
    aws lambda update-function-code \
      --function-name ${FUNCTION_NAME} \
      --zip-file fileb://function.zip \
      --no-cli-pager
    
    # Update environment variables
    echo -e "${YELLOW}Updating environment variables...${NOCOLOR}"
    aws lambda update-function-configuration \
      --function-name ${FUNCTION_NAME} \
      --environment "Variables={DB_HOST=$DB_HOST,DB_PORT=$DB_PORT,DB_NAME=$DB_NAME,DB_USER=$DB_USER,DB_PASSWORD=$DB_PASSWORD,DB_SCHEMA=edpm}" \
      --no-cli-pager
    
    echo -e "${GREEN}Lambda function updated successfully!${NOCOLOR}"
  else
    # Create new function
    echo -e "${YELLOW}Function doesn't exist, creating from CloudFormation template...${NOCOLOR}"
    aws cloudformation deploy \
      --template-file template.yml \
      --stack-name contract-savings-processor-stack \
      --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
      --no-cli-pager
    
    # Update the function code
    echo -e "${YELLOW}Updating function code...${NOCOLOR}"
    aws lambda update-function-code \
      --function-name ${FUNCTION_NAME} \
      --zip-file fileb://function.zip \
      --no-cli-pager
    
    echo -e "${GREEN}Lambda function created and deployed successfully!${NOCOLOR}"
  fi
else
  echo -e "${YELLOW}Deployment package created: function.zip${NOCOLOR}"
  echo -e "${YELLOW}To deploy, run: ./deploy.sh YOUR_FUNCTION_NAME${NOCOLOR}"
  echo -e "${YELLOW}Example: ./deploy.sh contract-savings-processor${NOCOLOR}"
fi