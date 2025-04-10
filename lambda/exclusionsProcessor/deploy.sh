# File: lambda/exclusionsProcessor/deploy.sh
#!/bin/bash

# Build and deploy exclusions processor Lambda function

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

  echo "Lambda function updated successfully!"
else
  echo "Deployment package created: function.zip"
  echo "To deploy, run: aws lambda update-function-code --function-name YOUR_FUNCTION_NAME --zip-file fileb://function.zip"
fi