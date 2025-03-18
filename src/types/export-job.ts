// File: src/types/export-job.ts

/**
 * Enum representing the possible states of an export job
 */
export enum ExportJobStatus {
    PENDING = 'PENDING',         // Job created but not yet started
    PROCESSING = 'PROCESSING',   // Job is currently being processed
    COMPLETED = 'COMPLETED',     // Job completed successfully
    ERROR = 'ERROR'              // Job failed with an error
  }
  
  /**
   * Interface representing an export job in the database
   */
  export interface ExportJob {
    jobId: string;              // Unique identifier for the job
    fileId: string;             // Reference to the file being exported
    status: ExportJobStatus;    // Current status of the job
    createdBy: string;          // User who initiated the export
    createdAt: Date;            // When the job was created
    updatedAt: Date;            // When the job was last updated
    completedAt?: Date;         // When the job was completed (if completed)
    totalRecords: number;       // Total number of records to process
    processedRecords: number;   // Number of records processed so far
    s3Key?: string;             // S3 key where the exported file is stored
    presignedUrl?: string;      // Presigned URL for downloading the file
    urlExpiry?: Date;           // When the presigned URL expires
    errorDetails?: {            // Details about any error that occurred
      message: string;
      stack?: string;
      code?: string;
    };
  }
  
  /**
   * Interface for the response from the export API
   */
  export interface ExportJobResponse {
    jobId: string;              // ID of the created export job
    status: ExportJobStatus;    // Initial status
    message: string;            // Message to display to the user
  }
  
  /**
   * Interface for the status response API
   */
  export interface ExportJobStatusResponse {
    jobId: string;
    status: ExportJobStatus;
    progress: {
      totalRecords: number;
      processedRecords: number;
      percentComplete: number;
    };
    downloadUrl?: string;       // URL for downloading the completed file
    expiresAt?: string;         // When the download URL expires
    errorMessage?: string;      // Error message if job failed
  }
  
  /**
   * Interface for Lambda export job payload
   */
  export interface ExportJobPayload {
    jobId: string;              // ID of the export job
    fileId: string;             // ID of the file to export
    userId: string;             // User who initiated the export
  }