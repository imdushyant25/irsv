// File: src/app/api/files/[fileId]/exclusions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { invokeLambda } from '@/lib/aws/lambda';
import { query } from '@/lib/db';
import { z } from 'zod';

// Validation schema for query parameters
const queryParamsSchema = z.object({
  categories: z.string().optional()
});

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params;
    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    const { searchParams } = request.nextUrl;
    const validatedParams = queryParamsSchema.parse(Object.fromEntries(searchParams));
    
    // Parse categories from comma-separated string if provided
    const categories = validatedParams.categories
      ? validatedParams.categories.split(',').map(c => c.trim()).filter(Boolean)
      : undefined;

    // Get file info to verify it exists
    const fileResult = await query(`
      SELECT file_id, opportunity_id
      FROM claims_file_registry
      WHERE file_id = $1
    `, [fileId]);

    if (fileResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Define the Lambda function name from environment variable or use default
    const lambdaName = process.env.EXCLUSIONS_PROCESSOR_LAMBDA_NAME || 'exclusions-processor';
    console.log(`Invoking Lambda ${lambdaName} for file ${fileId} exclusions analysis`);

    // Prepare payload for Lambda invocation
    const payload = {
      fileId,
      filters: categories  // Optional filter categories
    };

    // Invoke Lambda function
    const lambdaResponse = await invokeLambda(lambdaName, payload);
    
    if (!lambdaResponse || !lambdaResponse.body || !lambdaResponse.body.result) {
      throw new Error('Invalid response from exclusions processor');
    }

    // Return formatted response
    return NextResponse.json({
      message: 'Exclusions analysis completed successfully',
      data: lambdaResponse.body.result
    });

  } catch (error) {
    console.error('Error analyzing exclusions:', error);
    return NextResponse.json(
      { 
        error: 'Failed to analyze exclusions',
        details: error
      },
      { status: 500 }
    );
  }
}

// Allow POST for batch operations if needed
export async function POST(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params;
    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    // Parse request body to get filter categories
    const body = await request.json();
    const categories = body.categories || [];

    // Get Lambda function name
    const lambdaName = process.env.EXCLUSIONS_PROCESSOR_LAMBDA_NAME || 'exclusions-processor';
    
    // Prepare payload for Lambda invocation
    const payload = {
      fileId,
      filters: categories
    };

    // Invoke Lambda function
    const lambdaResponse = await invokeLambda(lambdaName, payload);
    
    if (!lambdaResponse || !lambdaResponse.body || !lambdaResponse.body.result) {
      throw new Error('Invalid response from exclusions processor');
    }

    // Return formatted response
    return NextResponse.json({
      message: 'Exclusions analysis completed successfully',
      data: lambdaResponse.body.result
    });

  } catch (error) {
    console.error('Error analyzing exclusions with filters:', error);
    return NextResponse.json(
      { 
        error: 'Failed to analyze exclusions',
        details: error
      },
      { status: 500 }
    );
  }
}