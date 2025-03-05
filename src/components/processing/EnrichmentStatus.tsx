// File: src/components/processing/EnrichmentStatus.tsx

import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Progress,
  Text,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Card,
  CardBody,
  Badge,
  Spinner,
  useToast
} from '@chakra-ui/react';
import { CheckCircle2, AlertCircle, Activity } from 'lucide-react';
import { EnrichmentStatus as EnrichmentStatusEnum } from '@/types/enrichment';

interface EnrichmentStatusResponse {
  status: EnrichmentStatusEnum;
  progress: {
    totalRecords: number;
    processedRecords: number;
    failedRecords: number;
    percentComplete: number;
  };
  timing: {
    startedAt: string;
    completedAt?: string;
    durationSeconds?: number;
  };
  enrichedFields: Array<{
    name: string;
    count: number;
    totalRecords: number;
  }>;
  errorDetails?: {
    message: string;
    details?: any;
  };
  runId: string;
}

interface EnrichmentStatusProps {
  fileId: string;
  onComplete?: () => void;
  onError?: (error: any) => void;
  pollInterval?: number; // in milliseconds
}

export default function EnrichmentStatus({
  fileId,
  onComplete,
  onError,
  pollInterval = 2000
}: EnrichmentStatusProps) {
  const [status, setStatus] = useState<EnrichmentStatusResponse | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [pollError, setPollError] = useState<string | null>(null);
  const toast = useToast();

  const pollStatus = useCallback(async () => {
    if (!isPolling) return;

    try {
      // Reset poll error on new attempt
      setPollError(null);

      const response = await fetch(`/api/files/${fileId}/enrichment/status`);

      if (!response.ok) {
        // If 404, no enrichment exists for this file
        if (response.status === 404) {
          setIsPolling(false);
          return;
        }
        throw new Error(`Failed to fetch enrichment status: ${response.statusText}`);
      }

      const data: EnrichmentStatusResponse = await response.json();
      setStatus(data);

      // Handle completion or error states
      if (data.status === EnrichmentStatusEnum.COMPLETED) {
        setIsPolling(false);
        onComplete?.();
        
        toast({
          title: 'Enrichment Complete',
          description: `Successfully processed ${data.progress.processedRecords} records`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      } else if (data.status === EnrichmentStatusEnum.ERROR) {
        setIsPolling(false);
        onError?.(data.errorDetails);
        
        toast({
          title: 'Enrichment Failed',
          description: data.errorDetails?.message || 'An error occurred during enrichment',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Error polling enrichment status:', error);
      setPollError(error instanceof Error ? error.message : 'Failed to check status');
      
      // Don't stop polling on transient errors
      if (error instanceof Error && error.message.includes('404')) {
        setIsPolling(false);
      }
    }
  }, [fileId, isPolling, onComplete, onError, toast]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isPolling) {
      // Initial poll
      pollStatus();
      // Set up polling interval
      intervalId = setInterval(pollStatus, pollInterval);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPolling, pollStatus, pollInterval]);

  const getStatusColor = (status: EnrichmentStatusEnum): string => {
    switch (status) {
      case EnrichmentStatusEnum.COMPLETED:
        return 'green';
      case EnrichmentStatusEnum.ERROR:
        return 'red';
      case EnrichmentStatusEnum.RUNNING:
        return 'blue';
      default:
        return 'gray';
    }
  };

  const getStatusIcon = () => {
    if (!status) return <Spinner size="sm" />;
    
    switch (status.status) {
      case EnrichmentStatusEnum.COMPLETED:
        return <CheckCircle2 size={20} color="green" />;
      case EnrichmentStatusEnum.ERROR:
        return <AlertCircle size={20} color="red" />;
      case EnrichmentStatusEnum.RUNNING:
        return <Activity size={20} color="blue" />;
      default:
        return <Spinner size="sm" />;
    }
  };

  // If we haven't found any status data yet
  if (!status && !pollError) {
    return (
      <Card variant="outline">
        <CardBody>
          <HStack spacing={2}>
            <Spinner size="sm" />
            <Text>Checking enrichment status...</Text>
          </HStack>
        </CardBody>
      </Card>
    );
  }

  // Render different states
  const renderContent = () => {
    if (pollError) {
      return (
        <Alert status="error" variant="subtle">
          <AlertIcon />
          <VStack align="start" spacing={1}>
            <AlertTitle>Status Check Failed</AlertTitle>
            <AlertDescription>{pollError}</AlertDescription>
          </VStack>
        </Alert>
      );
    }

    if (!status) return null;

    switch (status.status) {
      case EnrichmentStatusEnum.PENDING:
        return (
          <HStack>
            <Spinner size="sm" />
            <Text>Initializing enrichment process...</Text>
          </HStack>
        );

      case EnrichmentStatusEnum.RUNNING:
        return (
          <VStack spacing={4} align="stretch">
            <Progress
              value={status.progress.percentComplete}
              size="sm"
              colorScheme="blue"
              borderRadius="full"
            />
            <HStack justify="space-between" fontSize="sm">
              <Text>Processing records...</Text>
              <Text>
                {status.progress.processedRecords} of {status.progress.totalRecords}
                {status.progress.failedRecords > 0 && (
                  <Text as="span" color="red.500" ml={2}>
                    ({status.progress.failedRecords} failed)
                  </Text>
                )}
              </Text>
            </HStack>
          </VStack>
        );

      case EnrichmentStatusEnum.COMPLETED:
        return (
          <VStack spacing={4} align="stretch">
            <Alert status="success" variant="subtle">
              <AlertIcon />
              <VStack align="start" spacing={1}>
                <AlertTitle>Enrichment Complete</AlertTitle>
                <AlertDescription>
                  Successfully processed {status.progress.processedRecords} records
                  {status.timing.durationSeconds && ` in ${status.timing.durationSeconds} seconds`}
                </AlertDescription>
              </VStack>
            </Alert>

            {status.enrichedFields && status.enrichedFields.length > 0 && (
              <Box>
                <Text fontSize="sm" fontWeight="medium" mb={2}>
                  Enriched Fields:
                </Text>
                <VStack align="stretch" spacing={2}>
                  {status.enrichedFields.slice(0, 3).map(field => (
                    <HStack key={field.name} justify="space-between">
                      <Text fontSize="sm">{field.name}</Text>
                      <Badge colorScheme="green">
                        {field.count} records
                      </Badge>
                    </HStack>
                  ))}
                  {status.enrichedFields.length > 3 && (
                    <Text fontSize="sm" color="gray.500">
                      And {status.enrichedFields.length - 3} more fields...
                    </Text>
                  )}
                </VStack>
              </Box>
            )}
          </VStack>
        );

      case EnrichmentStatusEnum.ERROR:
        return (
          <Alert status="error" variant="subtle">
            <AlertIcon />
            <VStack align="start" spacing={1}>
              <AlertTitle>Enrichment Failed</AlertTitle>
              <AlertDescription>
                {status.errorDetails?.message || 'Unknown error occurred during enrichment'}
                {status.errorDetails?.details && (
                  <Text fontSize="sm" mt={1}>
                    {typeof status.errorDetails.details === 'object' 
                      ? JSON.stringify(status.errorDetails.details) 
                      : status.errorDetails.details}
                  </Text>
                )}
              </AlertDescription>
            </VStack>
          </Alert>
        );
    }
  };

  return (
    <Card variant="outline">
      <CardBody>
        <VStack spacing={4} align="stretch">
          <HStack justify="space-between">
            <HStack>
              {getStatusIcon()}
              <Text fontWeight="medium">
                Data Enrichment
              </Text>
            </HStack>
            {status && (
              <Badge colorScheme={getStatusColor(status.status)}>
                {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
              </Badge>
            )}
          </HStack>
          {renderContent()}
        </VStack>
      </CardBody>
    </Card>
  );
}