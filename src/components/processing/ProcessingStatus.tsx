// File: src/components/processing/ProcessingStatus.tsx
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
import { AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
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

      if (data.error) {
        setError(data.error.message);
        setIsPolling(false);
        onError?.(data.error);
      }

      if (data.status === ProcessingStatus.COMPLETED) {
        setIsPolling(false);
        onComplete?.();
        toast({
          title: 'Processing Complete',
          description: 'File has been successfully processed',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
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
            <Text fontWeight="bold">Processing Status</Text>
            <Badge colorScheme={getStatusColor(status)}>
              {status}
            </Badge>
          </HStack>

          {status === ProcessingStatus.PROCESSING && progress && (
            <Box>
              <Progress 
                value={progress.processedRows / progress.totalRows * 100} 
                size="sm" 
                colorScheme="blue"
                mb={2}
              />
              <Text fontSize="sm" color="gray.600">
                Processed {progress.processedRows} of {progress.totalRows} rows
              </Text>
            </Box>
          )}

          {status === ProcessingStatus.PENDING && (
            <HStack>
              <Spinner size="sm" />
              <Text>Initializing processing...</Text>
            </HStack>
          )}

          {status === ProcessingStatus.COMPLETED && (
            <Alert status="success" variant="subtle">
              <AlertIcon as={CheckCircle2} />
              <AlertTitle>Processing Complete</AlertTitle>
              <AlertDescription>
                All rows have been successfully processed
              </AlertDescription>
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