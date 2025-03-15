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
  Card,
  CardBody,
  Spinner,
  HStack,
  Badge,
  useToast
} from '@chakra-ui/react';
import { AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { ProcessingStatus, ProcessingProgress } from '@/types/claims-processing';

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
  const [batchStats, setBatchStats] = useState<{
    total: number;
    processed: number;
    enriched: number;
    failed: number;
    enrichedPercent: number;
    processedPercent: number;
  }>({
    total: 0,
    processed: 0,
    enriched: 0,
    failed: 0,
    enrichedPercent: 0,
    processedPercent: 0
  });
  const toast = useToast();

  const pollStatus = async () => {
    try {
      // Poll the main processing status
      const processingResponse = await fetch(`/api/files/${fileId}/process/status`);
      if (!processingResponse.ok) {
        throw new Error('Failed to fetch processing status');
      }

      const processingData = await processingResponse.json();
      setStatus(processingData.status);
      setProgress(processingData.progress);

      if (processingData.error) {
        setError(processingData.error.message);
        setIsPolling(false);
        onError?.(processingData.error);
      }

      // Poll batch statistics for parallel processing view
      const batchResponse = await fetch(`/api/files/${fileId}/batches/stats`);
      if (batchResponse.ok) {
        const batchData = await batchResponse.json();
        setBatchStats({
          total: batchData.totalBatches,
          processed: batchData.processedBatches,
          enriched: batchData.enrichedBatches,
          failed: batchData.failedBatches,
          processedPercent: batchData.totalBatches > 0 
            ? (batchData.processedBatches / batchData.totalBatches) * 100 
            : 0,
          enrichedPercent: batchData.totalBatches > 0 
            ? (batchData.enrichedBatches / batchData.totalBatches) * 100 
            : 0
        });
      }

      // Check if both processing and enrichment are complete
      if (processingData.status === ProcessingStatus.COMPLETED && 
          batchStats.total > 0 && 
          batchStats.enriched + batchStats.failed === batchStats.total) {
        setIsPolling(false);
        onComplete?.();
        
        toast({
          title: 'Processing Complete',
          description: 'File has been processed and enriched successfully',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
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

  return (
    <Card>
      <CardBody>
        <VStack spacing={4} align="stretch">
          <HStack justify="space-between">
            <Text fontWeight="bold">Lambda Processing Status</Text>
            <Badge colorScheme={getStatusColor(status)}>
              {status}
            </Badge>
          </HStack>

          {/* Main Processing Progress */}
          {(status === ProcessingStatus.PROCESSING || status === ProcessingStatus.PROCESSING_COMBINED) && progress && (
            <Box>
              <Text fontSize="sm" fontWeight="medium">File Processing:</Text>
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

          {/* Parallel Processing Stats */}
          {batchStats.total > 0 && (
            <Box mt={2}>
              <HStack spacing={6} justify="space-between">
                <VStack align="start" spacing={1}>
                  <Text fontSize="xs" color="gray.600">Processing</Text>
                  <Text fontWeight="medium">{batchStats.processedPercent.toFixed(0)}%</Text>
                  <Text fontSize="xs" color="gray.600">
                    {batchStats.processed} of {batchStats.total} batches
                  </Text>
                </VStack>
                
                <VStack align="start" spacing={1}>
                  <Text fontSize="xs" color="gray.600">Enrichment</Text>
                  <Text fontWeight="medium">{batchStats.enrichedPercent.toFixed(0)}%</Text>
                  <Text fontSize="xs" color="gray.600">
                    {batchStats.enriched} of {batchStats.total} batches
                  </Text>
                </VStack>
                
                {batchStats.failed > 0 && (
                  <VStack align="start" spacing={1}>
                    <Text fontSize="xs" color="gray.600">Failed</Text>
                    <Text fontWeight="medium" color="red.500">{batchStats.failed}</Text>
                    <Text fontSize="xs" color="gray.600">
                      {((batchStats.failed / batchStats.total) * 100).toFixed(0)}% of batches
                    </Text>
                  </VStack>
                )}
              </HStack>
              
              {/* Enrichment Progress Bar */}
              <Box mt={3}>
                <Text fontSize="sm" fontWeight="medium">Lambda Batch Progress:</Text>
                <Progress 
                  value={batchStats.enrichedPercent} 
                  size="sm" 
                  colorScheme="purple"
                  mb={2}
                />
              </Box>
            </Box>
          )}

          {status === ProcessingStatus.PENDING && (
            <HStack>
              <Spinner size="sm" />
              <Text>
                Initializing Lambda processing...
              </Text>
            </HStack>
          )}

          {status === ProcessingStatus.COMPLETED && (
            <Alert status="success" variant="subtle">
              <AlertIcon as={CheckCircle2} />
              <Box>
                <AlertTitle>
                  Processing Complete
                </AlertTitle>
                <AlertDescription>
                  {batchStats.enriched === batchStats.total
                    ? 'All data has been successfully processed and enriched'
                    : `Processing complete. Enrichment: ${batchStats.enriched} of ${batchStats.total} batches (${batchStats.enrichedPercent.toFixed(0)}%)`}
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

          {/* Status refresh button */}
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