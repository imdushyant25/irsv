// File: src/app/api/files/[fileId]/savings/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { invokeLambda } from '@/lib/aws/lambda';
import { query } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params;
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');

    // First, check if the file exists and get the opportunity ID
    const fileQuery = `
      SELECT opportunity_id
      FROM claims_file_registry
      WHERE file_id = $1
    `;
    const fileResult = await query(fileQuery, [fileId]);
    
    if (fileResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    
    const opportunityId = fileResult.rows[0].opportunity_id;

    // Prepare the payload for the Lambda
    const payload = {
      fileId,
      opportunityId,
      category: category || undefined
    };

    // Invoke the savingsResultsProcessor Lambda
    console.log(`Fetching savings results for file: ${fileId}, category: ${category || 'all'}`);
    
    const lambdaResponse = await invokeLambda(
      process.env.SAVINGS_RESULTS_PROCESSOR_LAMBDA_NAME || 'savingsResultsProcessor',
      payload,
      'RequestResponse'
    );

    if (lambdaResponse.statusCode !== 200) {
      throw new Error(lambdaResponse.body?.message || 'Error fetching savings results');
    }

    return NextResponse.json({ 
      data: lambdaResponse.body.data,
      message: lambdaResponse.body.message
    });
  } catch (error) {
    console.error('Error in savings results API:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch savings results',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}