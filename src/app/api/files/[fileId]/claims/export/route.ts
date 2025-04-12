// File: src/app/api/files/[fileId]/claims/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import * as XLSX from 'xlsx';
import { FileStatus } from '@/types/file';

interface ClaimRecord {
  'Row Number': number;
  'Validation Status': string;
  'Processing Status': string;
  'Created At': Date;
  'Mapped Fields': Record<string, any>;
  'Lookup Fields'?: Record<string, any>;
}

interface FlattenedClaimRecord {
  [key: string]: string | number; // Index signature for dynamic fields
}

export async function POST(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params;

    // First, check if the file is enriched
    const fileStatusQuery = `
      SELECT status
      FROM claims_file_registry
      WHERE file_id = $1
    `;
    const fileStatusResult = await query(fileStatusQuery, [fileId]);
    
    if (fileStatusResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    
    const fileStatus = fileStatusResult.rows[0].status;
    const isEnriched = fileStatus === FileStatus.ENRICHED;

    // Fetch claims data - include lookup_fields if file is enriched
    const queryText = `
      SELECT 
        row_number as "Row Number",
        ${isEnriched ? 'lookup_fields as "Lookup Fields",' : ''}
        validation_status as "Validation Status",
        processing_status as "Processing Status",
        created_at as "Created At"
      FROM claim_records 
      WHERE file_id = $1
      ORDER BY row_number ASC
    `;

    const result = await query<ClaimRecord>(queryText, [fileId]);

    // Define the specific lookup fields to include in the export
    const specificLookupFields = [
      'ndc11', 'quantity', 'days_supply', 'fill_date', 'member_copay', 
      'specialty_indicator', 'brnd_gnrc', 'drug_label_name', 'mspan_unit_price', 
      'avg_rebate_per_DS', 'reprice_plan_cost', 'reprice_gross_cost', 
      'applied_awp_discount', 'reprice_net_plan_cost'
    ];

    // Process the data for Excel - only including the specific lookup fields
    const flattenedData: FlattenedClaimRecord[] = result.rows.map(row => {
      const baseRecord: FlattenedClaimRecord = {
        'Row Number': row['Row Number']
      };

      // Add only the specific lookup fields if they exist
      if (isEnriched && row['Lookup Fields']) {
        for (const fieldName of specificLookupFields) {
          const value = row['Lookup Fields'][fieldName];
          if (value !== undefined) {
            baseRecord[fieldName] = value !== null ? String(value) : '';
          }
        }
      }

      return baseRecord;
    });

    // Create column headers from the specific lookup fields
    const headerRow = ['Row Number', ...specificLookupFields.filter(field => 
      // Only include fields that actually exist in at least one record
      flattenedData.some(record => record[field] !== undefined)
    )];
    
    // Create a 2D array for the data
    const aoa: string[][] = [headerRow];
    
    // Convert flattenedData to array-of-arrays format
    flattenedData.forEach(row => {
      const rowArray = headerRow.map(col => {
        // Convert all values to strings to satisfy TypeScript
        const value = row[col];
        return value !== undefined && value !== null ? String(value) : "";
      });
      aoa.push(rowArray);
    });
    
    // Create the worksheet from the array of arrays
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    
    // Create a guide sheet to explain the data
    const guideRows = [
      ["CLAIMS DATA EXPORT GUIDE"],
      [""],
      ["This export includes the following fields:"],
      [""],
      ["Row Number - The original row number from the claims file"],
      [""]
    ];

    // Add descriptions for each lookup field
    specificLookupFields.forEach(field => {
      guideRows.push([`${field} - Lookup data for ${field.replace(/_/g, ' ')}`]);
    });
    
    const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
    
    // Add sheets to workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Claims Data');
    XLSX.utils.book_append_sheet(wb, guideSheet, 'Guide');
    
    // Generate buffer
    const buffer = XLSX.write(wb, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true
    });

    // Set response headers
    const headers = new Headers();
    headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    headers.set('Content-Disposition', `attachment; filename=claims_${fileId}_exclusions.xlsx`);

    return new NextResponse(buffer, {
      status: 200,
      headers
    });

  } catch (error) {
    console.error('Error exporting claims:', error);
    return NextResponse.json(
      { 
        error: 'Failed to export claims',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}