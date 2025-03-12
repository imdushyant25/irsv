import { Readable } from 'stream';
import * as XLSX from 'xlsx';
import { EventEmitter } from 'events';

export class ExcelStreamReader extends EventEmitter {
  private chunkSize: number;
  private rowOffset: number = 0;
  
  constructor(options: { chunkSize?: number } = {}) {
    super();
    this.chunkSize = options.chunkSize || 100;
  }

  /**
   * Process an Excel file buffer in chunks to avoid memory issues
   */
  async processBuffer(buffer: Buffer): Promise<void> {
    try {
      // Parse the workbook from buffer
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      // Get the first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Get headers from the first row
      const headers = this.getHeaderRow(worksheet);
      this.emit('headers', headers);
      
      // Process the data in chunks
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      const totalRows = range.e.r;
      
      // Process data starting from row 1 (after headers)
      for (let rowStart = 1; rowStart <= totalRows; rowStart += this.chunkSize) {
        // Calculate end of current chunk
        const rowEnd = Math.min(rowStart + this.chunkSize - 1, totalRows);
        
        // Create a range for this chunk
        const chunkRange = {
          s: { r: rowStart, c: range.s.c },
          e: { r: rowEnd, c: range.e.c }
        };
        
        // Create a new partial worksheet with just this range
        const partialWorksheet = this.createPartialWorksheet(worksheet, chunkRange);
        
        // Convert to JSON with headers
        const rows = XLSX.utils.sheet_to_json(partialWorksheet);
        
        // Emit each row
        for (const row of rows) {
          this.emit('row', row);
          this.rowOffset++;
        }
        
        // Emit progress
        this.emit('progress', {
          processed: this.rowOffset,
          total: totalRows,
          percentage: Math.round((this.rowOffset / totalRows) * 100)
        });
        
        // Allow some time for the event loop to process other events
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      // Signal completion
      this.emit('end');
    } catch (error) {
      this.emit('error', error);
    }
  }
  
  /**
   * Process an Excel file from a stream
   */
  async processStream(stream: Readable): Promise<void> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      
      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      stream.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          await this.processBuffer(buffer);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }
  
  /**
   * Get the header row from a worksheet
   */
  private getHeaderRow(worksheet: XLSX.WorkSheet): string[] {
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const headerRow: string[] = [];
    
    // Extract the first row as headers
    for (let c = range.s.c; c <= range.e.c; ++c) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c })];
      headerRow.push(cell?.v?.toString() || `Column${c}`);
    }
    
    return headerRow;
  }
  
  /**
   * Create a partial worksheet containing only the specified range
   */
  private createPartialWorksheet(
    worksheet: XLSX.WorkSheet, 
    range: XLSX.Range
  ): XLSX.WorkSheet {
    const newWorksheet: XLSX.WorkSheet = {};
    const originalRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    
    // Copy headers (row 0) to the new worksheet
    for (let c = originalRange.s.c; c <= originalRange.e.c; ++c) {
      const headerCell = worksheet[XLSX.utils.encode_cell({ r: 0, c })];
      if (headerCell) {
        newWorksheet[XLSX.utils.encode_cell({ r: 0, c })] = headerCell;
      }
    }
    
    // Copy cells from the specified range
    for (let r = range.s.r; r <= range.e.r; ++r) {
      for (let c = range.s.c; c <= range.e.c; ++c) {
        const cellAddress = XLSX.utils.encode_cell({ r, c });
        const cell = worksheet[cellAddress];
        if (cell) {
          // Place the row at position (r-range.s.r+1) in the new worksheet
          newWorksheet[XLSX.utils.encode_cell({ r: r-range.s.r+1, c })] = cell;
        }
      }
    }
    
    // Set the range for the new worksheet
    const newRange = {
      s: { r: 0, c: range.s.c },
      e: { r: range.e.r - range.s.r + 1, c: range.e.c }
    };
    newWorksheet['!ref'] = XLSX.utils.encode_range(newRange);
    
    // Copy merged cells if present
    if (worksheet['!merges']) {
      newWorksheet['!merges'] = [];
      for (const merge of worksheet['!merges']) {
        if (merge.s.r >= range.s.r && merge.e.r <= range.e.r) {
          // Adjust row numbers for the new worksheet
          newWorksheet['!merges'].push({
            s: { r: merge.s.r - range.s.r + 1, c: merge.s.c },
            e: { r: merge.e.r - range.s.r + 1, c: merge.e.c }
          });
        }
      }
    }
    
    return newWorksheet;
  }
}