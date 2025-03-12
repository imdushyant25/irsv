// File: src/components/processing/ProcessingStatus.tsx (updated version)

import React, { useEffect, useState } from 'react';
import {
  Box,
  VStack,
  Progress,
  Text,
  Button,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useToast,
  Card,
  CardBody,
  Spinner,
  HStack,
  Badge
} from '@chakra-ui/react';
import { AlertCircle, RefreshCw, CheckCircle2, Wand2 } from 'lucide-react';
import { ProcessingStatus, ProcessingProgress } from '@/types/claims-processing';
import { FileStatus } from '@/types/file';

interface ProcessingStatusProps {
  fileId: string;
  onComplete?: () => void;
  onError?: (error: any) => void;
}

export default function ProcessingStatusComponent({ 
  fileId, 
  onComplete,
  onError 
}: ProcessingStatusProps) {
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.PENDING);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [processingMode, setProcessingMode] = useState<'standard' | 'combined'>('standard');
  const toast = useToast();

  const pollStatus = async () => {
    try {
      const response = await fetch(`/api/files/${fileId}/process/status`);
      if (!response.ok) {
        throw new Error('Failed to fetch processing status');
      }

      const data = await response.json();
      setStatus(data.status);
      setProgress(data.progress);
      
      // Set processing mode if it's included in the response
      if (data.processingMode) {
        setProcessingMode(data.processingMode);
      }

      if (data.error) {
        setError(data.error.message);
        setIsPolling(false);
        onError?.(data.error);
      }

      if (data.status === ProcessingStatus.COMPLETED) {
        setIsPolling(false);
        onComplete?.();
        
        // Show different toast based on the processing mode
        if (processingMode === 'combined') {
          toast({
            title: 'Processing & Enrichment Complete',
            description: 'File has been processed and enriched successfully',
            status: 'success',
            duration: 5000,
            isClosable: true,
          });
        } else {
          toast({
            title: 'Processing Complete',
            description: 'File has been successfully processed',
            status: 'success',
            duration: 5000,
            isClosable: true,
          });
        }
      }
    } catch (error) {
      console.error('Error polling status:', error);
      setError(error instanceof Error ? error.message : 'Failed to check status');
      setIsPolling(false);
      onError?.(error);
    }
  };

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isPolling) {
      // Initial check
      pollStatus();
      // Set up polling every 3 seconds
      intervalId = setInterval(pollStatus, 3000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPolling, fileId]);

  const handleRetry = async () => {
    try {
      setError(null);
      const response = await fetch(`/api/files/${fileId}/process`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to retry processing');
      }

      setStatus(ProcessingStatus.PENDING);
      setIsPolling(true);
      toast({
        title: 'Processing Restarted',
        description: 'File processing has been restarted',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to retry processing');
      toast({
        title: 'Retry Failed',
        description: 'Failed to restart processing',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const getStatusColor = (status: ProcessingStatus) => {
    switch (status) {
      case ProcessingStatus.COMPLETED:
        return 'green';
      case ProcessingStatus.ERROR:
        return 'red';
      case ProcessingStatus.PROCESSING:
      case ProcessingStatus.PROCESSING_COMBINED:
        return 'blue';
      default:
        return 'gray';
    }
  };

  return (
    <Card>
      <CardBody>
        <VStack spacing={4} align="stretch">
          <HStack justify="space-between">
            <HStack>
              <Text fontWeight="bold">Processing Status</Text>
              {processingMode === 'combined' && (
                <Badge colorScheme="purple" display="flex" alignItems="center">
                  <HStack spacing={1}>
                    <Text>Combined</Text>
                    <Wand2 size={12} />
                  </HStack>
                </Badge>
              )}
            </HStack>
            <Badge colorScheme={getStatusColor(status)}>
              {status}
            </Badge>
          </HStack>

          {(status === ProcessingStatus.PROCESSING || status === ProcessingStatus.PROCESSING_COMBINED) && progress && (
            <Box>
              <Progress 
                value={progress.processedRows / progress.totalRows * 100} 
                size="sm" 
                colorScheme={processingMode === 'combined' ? 'purple' : 'blue'}
                mb={2}
              />
              <Text fontSize="sm" color="gray.600">
                Processed {progress.processedRows} of {progress.totalRows} rows
                {processingMode === 'combined' && ' (with enrichment)'}
              </Text>
            </Box>
          )}

          {status === ProcessingStatus.PENDING && (
            <HStack>
              <Spinner size="sm" />
              <Text>
                {processingMode === 'combined' 
                  ? 'Initializing combined processing & enrichment...'
                  : 'Initializing processing...'}
              </Text>
            </HStack>
          )}

          {status === ProcessingStatus.COMPLETED && (
            <Alert status="success" variant="subtle">
              <AlertIcon as={CheckCircle2} />
              <Box>
                <AlertTitle>
                  {processingMode === 'combined' 
                    ? 'Processing & Enrichment Complete'
                    : 'Processing Complete'}
                </AlertTitle>
                <AlertDescription>
                  {processingMode === 'combined' 
                    ? 'All rows have been successfully processed and enriched'
                    : 'All rows have been successfully processed'}
                </AlertDescription>
              </Box>
            </Alert>
          )}

          {error && (
            <Alert status="error" variant="subtle">
              <AlertIcon as={AlertCircle} />
              <Box>
                <AlertTitle>Processing Error</AlertTitle>
                <AlertDescription>
                  {error}
                  <Button
                    leftIcon={<RefreshCw size={16} />}
                    size="sm"
                    variant="outline"
                    colorScheme="red"
                    mt={2}
                    onClick={handleRetry}
                  >
                    Retry Processing
                  </Button>
                </AlertDescription>
              </Box>
            </Alert>
          )}
        </VStack>
      </CardBody>
    </Card>
  );
}