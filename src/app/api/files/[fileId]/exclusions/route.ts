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

    // Get file info to verify it exists and get opportunity_id
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

    const opportunityId = fileResult.rows[0].opportunity_id;
    if (!opportunityId) {
      return NextResponse.json(
        { error: 'Opportunity ID not found for this file' },
        { status: 400 }
      );
    }

    // Define the Lambda function name from environment variable or use default
    const lambdaName = process.env.EXCLUSIONS_PROCESSOR_LAMBDA_NAME || 'exclusions-processor';
    console.log(`Invoking Lambda ${lambdaName} for file ${fileId} with opportunity ${opportunityId} for exclusions analysis`);

    // Prepare payload for Lambda invocation with required opportunityId
    const payload = {
      fileId,
      opportunityId,
      filters: categories  // Optional filter categories
    };

    // Invoke Lambda function
    const lambdaResponse = await invokeLambda(lambdaName, payload);
    
    if (!lambdaResponse || !lambdaResponse.body || !lambdaResponse.body.result) {
      throw new Error('Invalid response from exclusions processor');
    }

    // Transform the results to maintain compatibility with frontend
    const resultData = transformExclusionsData(lambdaResponse.body.result);

    // Return formatted response
    return NextResponse.json({
      message: 'Exclusions analysis completed successfully',
      data: resultData
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

// Transform the new data structure to maintain compatibility with the frontend
function transformExclusionsData(resultData: any) {
  // The new structure has 'results' array with exclusion_type, exclusion_name, etc.
  if (!resultData.results || !Array.isArray(resultData.results)) {
    return {
      exclusion_categories: [],
      optional_program_categories: [],
      total_plan_cost: 0
    };
  }

  // Extract total plan cost from OVERALL TOTAL
  const overallTotal = resultData.results.find((item: any) => 
    item.exclusion_type === 'OVERALL TOTAL'
  );
  
  const total_plan_cost = overallTotal ? overallTotal.total_plan_cost : 0;

  // Group individual results (excluding totals) by exclusion_type
  const categories: { [key: string]: any[] } = {};
  
  resultData.results.forEach((item: any) => {
    // Skip totals rows
    if (item.exclusion_name === 'TOTAL' || item.exclusion_type === 'OVERALL TOTAL') {
      return;
    }
    
    // Map exclusion_type to expected category types
    let categoryType = '';
    if (item.exclusion_type === 'Plan') {
      categoryType = 'Plan Exclusion';
    } else if (item.exclusion_type === 'Drug') {
      categoryType = 'Drug Flag';
    } else {
      categoryType = item.exclusion_type;
    }
    
    // Create category array if it doesn't exist
    if (!categories[categoryType]) {
      categories[categoryType] = [];
    }
    
    // Add item to appropriate category
    categories[categoryType].push({
      category: item.exclusion_name,
      plan_cost_sum: item.total_plan_cost || 0,
      claim_count: item.claim_count || 0,
      unique_member_count: item.member_count || 0
    });
  });
  
  // Format to match the original structure expected by frontend
  return {
    exclusion_categories: categories['Plan Exclusion'] || [],
    optional_program_categories: categories['Drug Flag'] || [],
    total_plan_cost
  };
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

    // Get file info to verify it exists and get opportunity_id
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

    const opportunityId = fileResult.rows[0].opportunity_id;
    if (!opportunityId) {
      return NextResponse.json(
        { error: 'Opportunity ID not found for this file' },
        { status: 400 }
      );
    }

    // Get Lambda function name
    const lambdaName = process.env.EXCLUSIONS_PROCESSOR_LAMBDA_NAME || 'exclusions-processor';
    
    // Prepare payload for Lambda invocation with required opportunityId
    const payload = {
      fileId,
      opportunityId,
      filters: categories
    };

    // Invoke Lambda function
    const lambdaResponse = await invokeLambda(lambdaName, payload);
    
    if (!lambdaResponse || !lambdaResponse.body || !lambdaResponse.body.result) {
      throw new Error('Invalid response from exclusions processor');
    }

    // Transform the results to maintain compatibility with frontend
    const resultData = transformExclusionsData(lambdaResponse.body.result);

    // Return formatted response
    return NextResponse.json({
      message: 'Exclusions analysis completed successfully',
      data: resultData
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