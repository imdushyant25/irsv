// File: src/app/api/files/[fileId]/claims/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { z } from 'zod';

// Validation schema for query parameters
const queryParamsSchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('10'),
  validationStatus: z.string().optional(),
  processingStatus: z.string().optional(),
  search: z.string().optional(),
  costMin: z.string().transform(Number).optional(),
  costMax: z.string().transform(Number).optional(),
  dateStart: z.string().optional(),
  dateEnd: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params;
    const { searchParams } = request.nextUrl;
    
    // Validate and parse query parameters
    const validatedParams = queryParamsSchema.parse(Object.fromEntries(searchParams));
    
    // Calculate pagination
    const offset = (validatedParams.page - 1) * validatedParams.limit;
    
    // Build the base query
    let queryText = `
      SELECT 
        record_id as "recordId",
        row_number as "rowNumber",
        mapped_fields as "mappedFields",
        unmapped_fields as "unmappedFields",
        validation_status as "validationStatus",
        processing_status as "processingStatus",
        created_at as "createdAt"
      FROM claim_records 
      WHERE file_id = $1
    `;
    
    // Build the count query
    let countText = `
      SELECT COUNT(*) 
      FROM claim_records 
      WHERE file_id = $1
    `;

    // Array to hold query parameters
    const queryParams: any[] = [fileId];
    let paramIndex = 2; // Start from 2 since $1 is fileId

    // Add filter conditions
    const whereConditions: string[] = [];

    if (validatedParams.validationStatus) {
      whereConditions.push(`validation_status = $${paramIndex}`);
      queryParams.push(validatedParams.validationStatus);
      paramIndex++;
    }

    if (validatedParams.processingStatus) {
      whereConditions.push(`processing_status = $${paramIndex}`);
      queryParams.push(validatedParams.processingStatus);
      paramIndex++;
    }

    if (validatedParams.search) {
      whereConditions.push(`
        (mapped_fields::text ILIKE $${paramIndex} OR 
         unmapped_fields::text ILIKE $${paramIndex})
      `);
      queryParams.push(`%${validatedParams.search}%`);
      paramIndex++;
    }

    if (validatedParams.costMin !== undefined) {
      whereConditions.push(`(mapped_fields->>'cost')::numeric >= $${paramIndex}`);
      queryParams.push(validatedParams.costMin);
      paramIndex++;
    }

    if (validatedParams.costMax !== undefined) {
      whereConditions.push(`(mapped_fields->>'cost')::numeric <= $${paramIndex}`);
      queryParams.push(validatedParams.costMax);
      paramIndex++;
    }

    if (validatedParams.dateStart) {
      whereConditions.push(`created_at >= $${paramIndex}`);
      queryParams.push(validatedParams.dateStart);
      paramIndex++;
    }

    if (validatedParams.dateEnd) {
      whereConditions.push(`created_at <= $${paramIndex}`);
      queryParams.push(validatedParams.dateEnd);
      paramIndex++;
    }

    // Add where conditions to queries
    if (whereConditions.length > 0) {
      const whereClause = whereConditions.join(' AND ');
      queryText += ` AND ${whereClause}`;
      countText += ` AND ${whereClause}`;
    }

    // Add pagination
    queryText += ` ORDER BY row_number ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(validatedParams.limit, offset);

    // Execute queries
    const [claimsResult, countResult] = await Promise.all([
      query(queryText, queryParams),
      query(countText, queryParams.slice(0, -2)) // Remove limit and offset params
    ]);

    const totalRecords = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalRecords / validatedParams.limit);

    return NextResponse.json({
      claims: claimsResult.rows,
      pagination: {
        currentPage: validatedParams.page,
        totalPages,
        totalRecords,
        pageSize: validatedParams.limit
      }
    });

  } catch (error) {
    console.error('Error fetching claims:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch claims',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}