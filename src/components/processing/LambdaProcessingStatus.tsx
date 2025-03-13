// File: src/components/processing/LambdaProcessingStatus.tsx

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
  Card,
  CardBody,
  Spinner,
  HStack,
  Badge
} from '@chakra-ui/react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { ProcessingStatus, ProcessingProgress } from '@/types/claims-processing';

interface LambdaProcessingStatusProps {
  fileId: string;
  processingId: string;
  onComplete?: () => void;
  onError?: (error: any) => void;
  pollInterval?: number; // in milliseconds
}

export default function LambdaProcessingStatus({ 
  fileId, 
  processingId,
  onComplete,
  onError,
  pollInterval = 5000 // Poll every 5 seconds by default
}: LambdaProcessingStatusProps) {
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.PENDING);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);

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
      }
    } catch (error) {
      console.error('Error polling status:', error);
      setError(error instanceof Error ? error.message : 'Failed to check status');
    }
  };

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isPolling) {
      // Initial check
      pollStatus();
      // Set up polling
      intervalId = setInterval(pollStatus, pollInterval);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPolling, fileId, processingId, pollInterval]);

  const handleRefresh = () => {
    pollStatus();
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

  // Calculate progress percentage from the ProcessingProgress data
  const calculatePercentage = (progress: ProcessingProgress | null): number => {
    if (!progress || !progress.totalRows || progress.totalRows === 0) {
      return 0;
    }
    return Math.round((progress.processedRows / progress.totalRows) * 100);
  };

  return (
    <Card>
      <CardBody>
        <VStack spacing={4} align="stretch">
          <HStack justify="space-between">
            <Text fontWeight="bold">Processing Status (Lambda)</Text>
            <Badge colorScheme={getStatusColor(status)}>
              {status}
            </Badge>
          </HStack>

          {(status === ProcessingStatus.PROCESSING || status === ProcessingStatus.PROCESSING_COMBINED) && progress && (
            <Box>
              <Progress 
                value={calculatePercentage(progress)} 
                size="sm" 
                colorScheme="blue"
                mb={2}
                isIndeterminate={progress.processedRows === 0}
              />
              <Text fontSize="sm" color="gray.600">
                {progress.processedRows} of {progress.totalRows} rows processed 
                ({calculatePercentage(progress)}%)
              </Text>
            </Box>
          )}

          {status === ProcessingStatus.PENDING && (
            <HStack>
              <Spinner size="sm" />
              <Text>Waiting for Lambda to start processing...</Text>
            </HStack>
          )}

          {status === ProcessingStatus.COMPLETED && (
            <Alert status="success" variant="subtle">
              <AlertIcon as={CheckCircle2} />
              <Box>
                <AlertTitle>Processing Complete</AlertTitle>
                <AlertDescription>
                  Lambda has successfully processed all rows
                </AlertDescription>
              </Box>
            </Alert>
          )}

          {error && (
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Box>
                <AlertTitle>Processing Error</AlertTitle>
                <AlertDescription>
                  {error}
                </AlertDescription>
              </Box>
            </Alert>
          )}

          <Button 
            leftIcon={<RefreshCw size={16} />} 
            size="sm" 
            variant="outline" 
            onClick={handleRefresh}
            alignSelf="flex-end"
          >
            Refresh Status
          </Button>
        </VStack>
      </CardBody>
    </Card>
  );
}