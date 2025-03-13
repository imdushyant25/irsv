// File: src/lib/aws/lambda.ts

import { 
  LambdaClient, 
  InvokeCommand, 
  InvocationRequest, 
  InvocationType 
} from "@aws-sdk/client-lambda";

/**
 * Configure Lambda client with environment variables
 * Uses the AWS SDK v3 for improved modularity and reduced bundle size
 */
const lambdaClient = new LambdaClient({
  region: process.env.CUSTOM_AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.CUSTOM_AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.CUSTOM_AWS_SECRET_ACCESS_KEY || ''
  }
});

/**
 * Invokes a Lambda function and returns the response
 * @param functionName Name of the Lambda function to invoke
 * @param payload Data to pass to the Lambda function
 * @param invocationType Type of invocation (RequestResponse or Event)
 * @returns The response from the Lambda function
 */
export async function invokeLambda<T = any>(
  functionName: string,
  payload: any,
  invocationType: InvocationType = InvocationType.RequestResponse
): Promise<T> {
  try {
    console.log(`Invoking Lambda function ${functionName} with payload:`, payload);
    
    // Prepare the Lambda invocation parameters
    const params: InvocationRequest = {
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
      InvocationType: invocationType
    };

    // Invoke the Lambda function
    const command = new InvokeCommand(params);
    const response = await lambdaClient.send(command);

    // Handle the response
    if (response.FunctionError) {
      const errorPayload = response.Payload ? JSON.parse(Buffer.from(response.Payload).toString()) : {};
      throw new Error(`Lambda execution failed: ${errorPayload.errorMessage || 'Unknown error'}`);
    }

    // Parse and return the response payload
    if (response.Payload && response.Payload.length > 0) {
      try {
        const payloadStr = Buffer.from(response.Payload).toString();
        console.log(`Lambda response payload: ${payloadStr}`);
        return JSON.parse(payloadStr);
      } catch (error) {
        // Properly type the error
        const parseError = error as Error;
        console.error('Error parsing Lambda response:', parseError);
        throw new Error(`Failed to parse Lambda response: ${parseError.message}`);
      }
    }
    
    // Return empty object if no payload
    return {} as T;
  } catch (error) {
    console.error(`Error invoking Lambda function ${functionName}:`, error);
    throw error;
  }
}

export { lambdaClient };