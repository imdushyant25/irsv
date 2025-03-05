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
  'Unmapped Fields': Record<string, any>;
  'Dynamic Fields'?: Record<string, any>;
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

    // Fetch claims data - include dynamic_fields if file is enriched
    const queryText = `
      SELECT 
        row_number as "Row Number",
        mapped_fields as "Mapped Fields",
        unmapped_fields as "Unmapped Fields",
        ${isEnriched ? 'dynamic_fields as "Dynamic Fields",' : ''}
        validation_status as "Validation Status",
        processing_status as "Processing Status",
        created_at as "Created At"
      FROM claim_records 
      WHERE file_id = $1
      ORDER BY row_number ASC
    `;

    const result = await query<ClaimRecord>(queryText, [fileId]);

    // Define column categories for organizing the export
    let mappedColumns: string[] = [];
    let unmappedColumns: string[] = [];
    let enrichedColumns: string[] = [];

    // Process the data for Excel - excluding administrative columns
    const flattenedData: FlattenedClaimRecord[] = result.rows.map(row => {
      const baseRecord: FlattenedClaimRecord = {};

      // Add mapped fields
      for (const [key, value] of Object.entries(row['Mapped Fields'])) {
        baseRecord[key] = value !== null ? String(value) : '';
        if (!mappedColumns.includes(key)) {
          mappedColumns.push(key);
        }
      }

      // Add unmapped fields with prefix
      for (const [key, value] of Object.entries(row['Unmapped Fields'])) {
        const unmappedKey = 'Unmapped_' + key;
        baseRecord[unmappedKey] = value !== null ? String(value) : '';
        if (!unmappedColumns.includes(unmappedKey)) {
          unmappedColumns.push(unmappedKey);
        }
      }

      // Add dynamic (enriched) fields with prefix if the file is enriched
      if (isEnriched && row['Dynamic Fields']) {
        for (const [key, value] of Object.entries(row['Dynamic Fields'])) {
          // Handle nested objects in dynamic fields
          if (typeof value === 'object' && value !== null) {
            // Flatten nested objects with dot notation
            for (const [nestedKey, nestedValue] of Object.entries(value)) {
              const enrichedKey = `Enriched_${key}_${nestedKey}`;
              baseRecord[enrichedKey] = nestedValue !== null ? String(nestedValue) : '';
              if (!enrichedColumns.includes(enrichedKey)) {
                enrichedColumns.push(enrichedKey);
              }
            }
          } else {
            // Handle non-nested values
            const enrichedKey = `Enriched_${key}`;
            baseRecord[enrichedKey] = value !== null ? String(value) : '';
            if (!enrichedColumns.includes(enrichedKey)) {
              enrichedColumns.push(enrichedKey);
            }
          }
        }
      }

      return baseRecord;
    });

    // Organize columns by category
    const allColumns = [...mappedColumns, ...unmappedColumns, ...enrichedColumns];
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Create the data array for Excel
    // The strategy below changes to add data directly using array-of-arrays
    // which gives us more control over formatting
    
    // Create a header array with all column names
    const headerRow = [...allColumns];
    
    // Create a 2D array for the data
    const aoa: string[][] = [headerRow];
    
    // Add category labels - but only at the beginning of each section
    const categoryRow: string[] = Array(allColumns.length).fill("");
    
    if (mappedColumns.length > 0) {
      categoryRow[0] = "MAPPED FIELDS";
    }
    
    if (unmappedColumns.length > 0) {
      categoryRow[mappedColumns.length] = "UNMAPPED FIELDS";
    }
    
    if (enrichedColumns.length > 0) {
      categoryRow[mappedColumns.length + unmappedColumns.length] = "ENRICHED FIELDS";
    }
    
    // Add the category row
    aoa.push(categoryRow);
    
    // Convert flattenedData to array-of-arrays format
    flattenedData.forEach(row => {
      const rowArray = allColumns.map(col => {
        // Convert all values to strings to satisfy TypeScript
        const value = row[col];
        return value !== undefined && value !== null ? String(value) : "";
      });
      aoa.push(rowArray);
    });
    
    // Create the worksheet from the array of arrays
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    
    // Create a guide sheet to explain the data organization
    const guideRows = [
      ["CLAIMS DATA EXPORT GUIDE"],
      [""],
      ["The data in this export is organized into categories:"],
      [""],
      ["1. MAPPED FIELDS"],
      ["   Standard field names from the mapping configuration"],
      ["   Examples: " + mappedColumns.slice(0, 3).join(", ") + (mappedColumns.length > 3 ? ", ..." : "")],
      [""],
      ["2. UNMAPPED FIELDS"],
      ["   Original fields that were not mapped (prefixed with 'Unmapped_')"],
      ["   Examples: " + unmappedColumns.slice(0, 3).join(", ") + (unmappedColumns.length > 3 ? ", ..." : "")],
      [""]
    ];

    if (isEnriched && enrichedColumns.length > 0) {
      guideRows.push(
        ["3. ENRICHED FIELDS"],
        ["   Calculated fields added during enrichment (prefixed with 'Enriched_')"],
        ["   Examples: " + enrichedColumns.slice(0, 3).join(", ") + (enrichedColumns.length > 3 ? ", ..." : "")],
        [""]
      );
    }
    
    guideRows.push(
      [""],
      ["Note: The first row of the Claims Data sheet shows the category for each column."]
    );
    
    const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
    
    // Add sheets to workbook
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
    headers.set('Content-Disposition', `attachment; filename=claims_${fileId}.xlsx`);

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