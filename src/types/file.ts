// File: src/types/file.ts

/**
 * Represents a file record in the system
 */
export interface FileRecord {
  fileId: string;
  opportunityId: string;
  productId: string;
  originalFilename: string;
  uploadDate: Date;
  s3Location: string;
  status: FileStatus;
  fileSize: number;
  originalHeaders: string[];
  rowCount: number;
  processingStage: ProcessingStage;
  createdBy?: string;
  createdAt?: Date;
  updatedBy?: string;
  updatedAt?: Date;
}

/**
 * Enum representing all possible file statuses
 */
export enum FileStatus {
  PENDING = 'PENDING',               // File is awaiting action
  PROCESSING = 'PROCESSING',         // File is being processed
  MAPPED = 'MAPPED',                 // File has been successfully mapped
  ERROR = 'ERROR',                   // An error occurred during processing
  PROCESSING_CLAIMS = 'PROCESSING_CLAIMS', // File is being processed to create claims
  PROCESSED = 'PROCESSED',            // Claims processing is complete
  ENRICHED = 'ENRICHED'              // File has been enriched with additional data
}

/**
 * Enum representing all possible processing stages
 */
export enum ProcessingStage {
  READY_FOR_MAPPING = 'READY_FOR_MAPPING',         // File is ready for field mapping
  MAPPING_IN_PROGRESS = 'MAPPING_IN_PROGRESS',     // Mapping is currently being performed
  MAPPING_COMPLETE = 'MAPPING_COMPLETE',           // Mapping has been completed
  CLAIMS_PROCESSING = 'CLAIMS_PROCESSING',         // Converting to claims records
  CLAIMS_PROCESSED = 'CLAIMS_PROCESSED',           // Claims processing complete
  PROCESSED = 'PROCESSED'                          // File is fully processed
}

/**
 * Defines valid transitions between processing stages
 */
export const validStageTransitions: Record<ProcessingStage, ProcessingStage[]> = {
  [ProcessingStage.READY_FOR_MAPPING]: [
    ProcessingStage.MAPPING_IN_PROGRESS
  ],
  [ProcessingStage.MAPPING_IN_PROGRESS]: [
    ProcessingStage.MAPPING_COMPLETE,
    ProcessingStage.READY_FOR_MAPPING  // Allow going back if needed
  ],
  [ProcessingStage.MAPPING_COMPLETE]: [
    ProcessingStage.CLAIMS_PROCESSING,
    ProcessingStage.MAPPING_IN_PROGRESS  // Allow corrections
  ],
  [ProcessingStage.CLAIMS_PROCESSING]: [
    ProcessingStage.CLAIMS_PROCESSED,
    ProcessingStage.MAPPING_COMPLETE  // Allow retry from mapping
  ],
  [ProcessingStage.CLAIMS_PROCESSED]: [
    ProcessingStage.PROCESSED
  ],
  [ProcessingStage.PROCESSED]: []  // No further transitions allowed
};

/**
 * Defines valid transitions between file statuses
 */
export const validStatusTransitions: Record<FileStatus, FileStatus[]> = {
  [FileStatus.PENDING]: [
    FileStatus.PROCESSING
  ],
  [FileStatus.PROCESSING]: [
    FileStatus.MAPPED,
    FileStatus.ERROR
  ],
  [FileStatus.MAPPED]: [
    FileStatus.PROCESSING_CLAIMS,
    FileStatus.ERROR
  ],
  [FileStatus.PROCESSING_CLAIMS]: [
    FileStatus.PROCESSED,
    FileStatus.ERROR
  ],
  [FileStatus.PROCESSED]: [
    FileStatus.ENRICHED,
    FileStatus.ERROR
  ],
  [FileStatus.ENRICHED]: [
    FileStatus.PROCESSED,  // Allow reverting to processed if needed
    FileStatus.ERROR
  ],
  [FileStatus.ERROR]: [
    FileStatus.PROCESSING,
    FileStatus.PROCESSING_CLAIMS,
    FileStatus.PROCESSED  // Allow retrying from error
  ]
};

/**
 * Type guard to check if a stage transition is valid
 */
export function isValidStageTransition(
  currentStage: ProcessingStage,
  newStage: ProcessingStage
): boolean {
  return validStageTransitions[currentStage]?.includes(newStage) ?? false;
}

/**
 * Type guard to check if a status transition is valid
 */
export function isValidStatusTransition(
  currentStatus: FileStatus,
  newStatus: FileStatus
): boolean {
  return validStatusTransitions[currentStatus]?.includes(newStatus) ?? false;
}

/**
 * Helper function to determine if a file should be shown in mapping tab
 */
export function isFileAvailableForMapping(file: FileRecord): boolean {
  const validCombinations = [
    { status: FileStatus.PENDING, stage: ProcessingStage.READY_FOR_MAPPING },
    { status: FileStatus.PROCESSING, stage: ProcessingStage.MAPPING_IN_PROGRESS },
    { status: FileStatus.MAPPED, stage: ProcessingStage.MAPPING_COMPLETE },
    { status: FileStatus.ERROR, stage: ProcessingStage.MAPPING_IN_PROGRESS }
  ];

  return validCombinations.some(
    combo => combo.status === file.status && combo.stage === file.processingStage
  );
}

/**
 * Helper function to determine if a file is in a final state
 */
export function isFileProcessingComplete(file: FileRecord): boolean {
  return file.status === FileStatus.PROCESSED &&
         file.processingStage === ProcessingStage.PROCESSED;
}

/**
 * Helper function to determine if a file can be processed
 */
export function canProcessFile(file: FileRecord): boolean {
  return file.status === FileStatus.MAPPED &&
         file.processingStage === ProcessingStage.MAPPING_COMPLETE;
}

/**
 * Helper function to get display text for file status
 */
export function getFileStatusDisplay(status: FileStatus): string {
  const displayMap: Record<FileStatus, string> = {
    [FileStatus.PENDING]: 'Pending',
    [FileStatus.PROCESSING]: 'Processing',
    [FileStatus.MAPPED]: 'Mapped',
    [FileStatus.ERROR]: 'Error',
    [FileStatus.PROCESSING_CLAIMS]: 'Processing Claims',
    [FileStatus.PROCESSED]: 'Processed',
    [FileStatus.ENRICHED]: 'Enriched'
  };
  return displayMap[status] || status;
}

/**
 * Helper function to get display text for processing stage
 */
export function getProcessingStageDisplay(stage: ProcessingStage): string {
  const displayMap: Record<ProcessingStage, string> = {
    [ProcessingStage.READY_FOR_MAPPING]: 'Ready for Mapping',
    [ProcessingStage.MAPPING_IN_PROGRESS]: 'Mapping in Progress',
    [ProcessingStage.MAPPING_COMPLETE]: 'Mapping Complete',
    [ProcessingStage.CLAIMS_PROCESSING]: 'Processing Claims',
    [ProcessingStage.CLAIMS_PROCESSED]: 'Claims Processed',
    [ProcessingStage.PROCESSED]: 'Processed'
  };
  return displayMap[stage] || stage;
}