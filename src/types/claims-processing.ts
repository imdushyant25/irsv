// File: src/types/claims-processing.ts

export enum ProcessingStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    ERROR = 'ERROR'
}

export interface ProcessingHistory {
    processingId: string;
    fileId: string;
    startTime: Date;
    endTime?: Date;
    status: ProcessingStatus;
    totalRows: number;
    processedRows: number;
    errorDetails?: {
        message: string;
        details?: Record<string, any>;
        rowNumber?: number;
    };
    createdBy: string;
    createdAt: Date;
    updatedBy?: string;
    updatedAt?: Date;
}

export interface ProcessingProgress {
    status: ProcessingStatus;
    totalRows: number;
    processedRows: number;
    errorDetails?: {
        message: string;
        details?: Record<string, any>;
    };
}

// Types for API responses
export interface ProcessingResponse {
    processingId: string;
    status: ProcessingStatus;
    message: string;
}

export interface ProcessingStatusResponse {
    status: ProcessingStatus;
    progress: ProcessingProgress;
    errorDetails?: {
        message: string;
        details?: Record<string, any>;
    };
}