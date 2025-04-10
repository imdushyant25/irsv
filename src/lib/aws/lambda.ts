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
    console.log(`Invoking Lambda function ${functionName} with payload:`, JSON.stringify(payload, null, 2));
    
    // Add debug information for AWS credentials
    console.log('AWS Region:', process.env.CUSTOM_AWS_REGION || 'us-east-1');
    console.log('AWS Access Key ID (masked):', process.env.CUSTOM_AWS_ACCESS_KEY_ID 
      ? `${process.env.CUSTOM_AWS_ACCESS_KEY_ID.substring(0, 4)}...` 
      : 'Not provided');
    
    // Prepare the Lambda invocation parameters
    const params: InvocationRequest = {
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
      InvocationType: invocationType
    };

    // Invoke the Lambda function
    console.log('Invoking Lambda with params:', JSON.stringify(params, (key, value) => 
      key === 'Payload' ? '[Buffer]' : value, 2));
    
    const command = new InvokeCommand(params);
    const response = await lambdaClient.send(command);

    console.log('Lambda response status code:', response.$metadata.httpStatusCode);
    console.log('Lambda response headers:', response.$metadata);

    // Handle the response
    if (response.FunctionError) {
      const errorPayload = response.Payload ? JSON.parse(Buffer.from(response.Payload).toString()) : {};
      console.error('Lambda execution failed with FunctionError:', response.FunctionError);
      console.error('Error payload:', errorPayload);
      throw new Error(`Lambda execution failed: ${errorPayload.errorMessage || errorPayload.message || 'Unknown error'}`);
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
        console.error('Raw response payload:', response.Payload ? Buffer.from(response.Payload).toString('hex') : null);
        throw new Error(`Failed to parse Lambda response: ${parseError.message}`);
      }
    }
    
    // Return empty object if no payload
    console.log('No payload in Lambda response');
    return {} as T;
  } catch (error) {
    console.error(`Error invoking Lambda function ${functionName}:`, error);
    throw error;
  }
}

export { lambdaClient };