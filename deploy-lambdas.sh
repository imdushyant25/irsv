#!/bin/bash

# Script to deploy all lambdas with environment variables

# Check if environment variables are set
if [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
  echo "Error: Database environment variables must be set"
  echo "Required variables: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD"
  exit 1
fi

# Check if workflow function name is provided
if [ -z "$1" ]; then
  echo "Error: Workflow orchestrator function name must be provided"
  echo "Usage: ./deploy-lambdas.sh <workflow-function-name> <weight-loss-function-name> <diabetes-function-name> <hdcr-function-name> <contract-savings-function-name>"
  exit 1
fi

# Check if weight loss function name is provided
if [ -z "$2" ]; then
  echo "Error: Weight loss savings processor function name must be provided"
  echo "Usage: ./deploy-lambdas.sh <workflow-function-name> <weight-loss-function-name> <diabetes-function-name> <hdcr-function-name> <contract-savings-function-name>"
  exit 1
fi

# Check if diabetes function name is provided
if [ -z "$3" ]; then
  echo "Error: Diabetes processor function name must be provided"
  echo "Usage: ./deploy-lambdas.sh <workflow-function-name> <weight-loss-function-name> <diabetes-function-name> <hdcr-function-name> <contract-savings-function-name>"
  exit 1
fi

# Check if HDCR function name is provided
if [ -z "$4" ]; then
  echo "Error: HDCR processor function name must be provided"
  echo "Usage: ./deploy-lambdas.sh <workflow-function-name> <weight-loss-function-name> <diabetes-function-name> <hdcr-function-name> <contract-savings-function-name>"
  exit 1
fi

# Check if Contract Savings function name is provided
if [ -z "$5" ]; then
  echo "Error: Contract Savings processor function name must be provided"
  echo "Usage: ./deploy-lambdas.sh <workflow-function-name> <weight-loss-function-name> <diabetes-function-name> <hdcr-function-name> <contract-savings-function-name>"
  exit 1
fi

WORKFLOW_FUNCTION_NAME=$1
WEIGHT_LOSS_FUNCTION_NAME=$2
DIABETES_FUNCTION_NAME=$3
HDCR_FUNCTION_NAME=$4
CONTRACT_SAVINGS_FUNCTION_NAME=$5

echo "### Building and deploying weight loss savings processor ###"
cd lambda/weightLossSavingsProcessor
chmod +x deploy.sh
./deploy.sh $WEIGHT_LOSS_FUNCTION_NAME
cd ../..

echo "### Building and deploying diabetes processor ###"
cd lambda/diabetesProcessor
chmod +x deploy.sh
./deploy.sh $DIABETES_FUNCTION_NAME
cd ../..

echo "### Building and deploying HDCR processor ###"
cd lambda/hdcrProcessor
chmod +x deploy.sh
./deploy.sh $HDCR_FUNCTION_NAME
cd ../..

echo "### Building and deploying contract savings processor ###"
cd lambda/contractSavingsProcessor
chmod +x deploy.sh
./deploy.sh $CONTRACT_SAVINGS_FUNCTION_NAME
cd ../..

echo "### Building and deploying workflow orchestrator ###"
cd lambda/workflowOrchestrator
chmod +x deploy.sh
./deploy.sh $WORKFLOW_FUNCTION_NAME
cd ../..

echo "### Deployment Complete ###"
echo "Weight Loss Processor: $WEIGHT_LOSS_FUNCTION_NAME"
echo "Diabetes Processor: $DIABETES_FUNCTION_NAME"
echo "HDCR Processor: $HDCR_FUNCTION_NAME"
echo "Contract Savings Processor: $CONTRACT_SAVINGS_FUNCTION_NAME"
echo "Workflow Orchestrator: $WORKFLOW_FUNCTION_NAME"
echo 
echo "To test the workflow, run a file through the process using the API:"
echo "POST /api/files/:fileId/process"
echo
echo "To verify all lambdas are being called, check CloudWatch logs for all functions."