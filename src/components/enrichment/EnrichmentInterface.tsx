// File: src/components/enrichment/EnrichmentInterface.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Button,
  Card,
  CardHeader,
  CardBody,
  Heading,
  Text,
  Badge,
  Progress,
  Alert,
  AlertIcon,
  useToast,
  Tooltip,
  Divider,
  List,
  ListItem,
  ListIcon
} from '@chakra-ui/react';
import { CheckCircle, AlertCircle, PlayCircle, Info, AlertTriangle } from 'lucide-react';
import { EnrichmentStatus } from '@/types/enrichment';

interface RuleValidation {
  canRun: boolean;
  missingFields: string[];
}

interface ValidationResponse {
  canEnrich: boolean;
  ruleValidations: Record<string, RuleValidation>;
  message: string;
  mappedFields: string[];
}

interface EnrichmentStatusResponse {
  status: EnrichmentStatus;
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
  enrichedFields: EnrichmentField[];
  errorDetails?: {
    message: string;
    details?: any;
    ruleStats?: Array<{
      ruleId: string;
      ruleName: string;
      attempted: number;
      succeeded: number;
      successRate: number;
    }>;
  };
  runId: string;
}

interface EnrichmentField {
  name: string;
  count: number;
  totalRecords: number;
}

interface EnrichmentInterfaceProps {
  fileId: string;
  onComplete?: () => void;
}

export default function EnrichmentInterface({ fileId, onComplete }: EnrichmentInterfaceProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [validationLoading, setValidationLoading] = useState(true);
  const [enrichmentStatus, setEnrichmentStatus] = useState<EnrichmentStatusResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const toast = useToast();

  // Validate if the file can be enriched - updated to handle multiple rules
  useEffect(() => {
    const validateEnrichment = async () => {
      try {
        setValidationLoading(true);
        const response = await fetch(`/api/files/${fileId}/enrichment/validate`);
        
        if (!response.ok) {
          throw new Error('Failed to validate enrichment');
        }
        
        const data: ValidationResponse = await response.json();
        setValidation(data);
      } catch (error) {
        console.error('Error validating enrichment:', error);
        toast({
          title: 'Validation Error',
          description: error instanceof Error ? error.message : 'Failed to validate enrichment',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        
        // Set default validation state on error
        setValidation({
          canEnrich: false,
          ruleValidations: {},
          message: 'Error validating enrichment capabilities',
          mappedFields: []
        });
      } finally {
        setValidationLoading(false);
      }
    };

    validateEnrichment();
  }, [fileId, toast]);

  // Check if enrichment is already in progress
  useEffect(() => {
    const checkExistingEnrichment = async () => {
      try {
        const response = await fetch(`/api/files/${fileId}/enrichment/status`);
        
        if (!response.ok) {
          // If 404, no enrichment exists yet, which is fine
          if (response.status === 404) {
            return;
          }
          throw new Error('Failed to check enrichment status');
        }
        
        const data = await response.json();
        setEnrichmentStatus(data);
        
        // If enrichment is in progress, start polling
        if (data.status === EnrichmentStatus.RUNNING || data.status === EnrichmentStatus.PENDING) {
          setIsPolling(true);
        }
      } catch (error) {
        console.error('Error checking existing enrichment:', error);
      }
    };

    checkExistingEnrichment();
  }, [fileId]);

  // Poll for enrichment status updates
  const pollStatus = useCallback(async () => {
    if (!isPolling) return;

    try {
      setPollError(null);
      const response = await fetch(`/api/files/${fileId}/enrichment/status`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch enrichment status: ${response.statusText}`);
      }
      
      const data = await response.json();
      setEnrichmentStatus(data);
      
      // Stop polling when complete or error
      if (data.status === EnrichmentStatus.COMPLETED || data.status === EnrichmentStatus.ERROR) {
        setIsPolling(false);
        
        if (data.status === EnrichmentStatus.COMPLETED) {
          toast({
            title: 'Enrichment Complete',
            description: `Successfully processed ${data.progress.processedRecords} records`,
            status: 'success',
            duration: 5000,
            isClosable: true,
          });
          
          onComplete?.();
        }
        
        if (data.status === EnrichmentStatus.ERROR) {
          toast({
            title: 'Enrichment Failed',
            description: data.errorDetails?.message || 'Unknown error occurred during enrichment',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
        }
      }
    } catch (error) {
      console.error('Error polling enrichment status:', error);
      setPollError(error instanceof Error ? error.message : 'Failed to check status');
    }
  }, [fileId, isPolling, onComplete, toast]);

  // Set up polling interval
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isPolling) {
      // Initial poll
      pollStatus();
      // Set up polling interval every 2 seconds
      intervalId = setInterval(pollStatus, 2000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPolling, pollStatus]);

  // Start the enrichment process
  const startEnrichment = async () => {
    try {
      setIsProcessing(true);
      const response = await fetch(`/api/files/${fileId}/enrichment`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to start enrichment');
      }

      const data = await response.json();
      
      toast({
        title: 'Enrichment Started',
        description: 'Data enrichment process has been initiated',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
      
      // Start polling for status updates
      setIsPolling(true);
    } catch (error) {
      console.error('Error starting enrichment:', error);
      toast({
        title: 'Enrichment Failed',
        description: error instanceof Error ? error.message : 'Failed to start enrichment',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusColor = (status: EnrichmentStatus): string => {
    switch (status) {
      case EnrichmentStatus.COMPLETED:
        return 'green';
      case EnrichmentStatus.ERROR:
        return 'red';
      case EnrichmentStatus.RUNNING:
        return 'blue';
      default:
        return 'gray';
    }
  };

  const getStatusIcon = (status: EnrichmentStatus) => {
    switch (status) {
      case EnrichmentStatus.COMPLETED:
        return <CheckCircle size={20} />;
      case EnrichmentStatus.ERROR:
        return <AlertCircle size={20} />;
      case EnrichmentStatus.RUNNING:
        return <PlayCircle size={20} />;
      default:
        return <Info size={20} />;
    }
  };

  const renderRuleValidation = (ruleName: string, validation: RuleValidation) => {
    if (!validation) return null;
    
    return (
      <HStack key={ruleName} spacing={3} align="flex-start">
        {validation.canRun ? (
          <CheckCircle size={16} color="green" />
        ) : (
          <AlertTriangle size={16} color="orange" />
        )}
        <VStack align="start" spacing={1}>
          <Text fontWeight="medium">{ruleName} Rule</Text>
          {validation.canRun ? (
            <Text fontSize="sm" color="green.600">
              Can run with current mappings
            </Text>
          ) : (
            <>
              <Text fontSize="sm" color="orange.600">
                Cannot run - missing fields:
              </Text>
              <List spacing={1} pl={4}>
                {validation.missingFields.map((field) => (
                  <ListItem key={field} fontSize="sm">
                    • {field}
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </VStack>
      </HStack>
    );
  };

  if (validationLoading) {
    return (
      <Card>
        <CardHeader>
          <Heading size="md">Data Enrichment</Heading>
        </CardHeader>
        <CardBody>
          <Text>Checking enrichment capabilities...</Text>
          <Progress size="sm" isIndeterminate colorScheme="blue" mt={2} />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <HStack justify="space-between">
          <Heading size="md">Data Enrichment</Heading>
          {!enrichmentStatus && validation?.canEnrich && (
            <Button
              colorScheme="blue"
              onClick={startEnrichment}
              isLoading={isProcessing}
              loadingText="Starting..."
            >
              Start Enrichment
            </Button>
          )}
        </HStack>
      </CardHeader>
      <CardBody>
        <VStack spacing={4} align="stretch">
          {/* Validation Result - Updated to show per-rule validation */}
          {validation && !enrichmentStatus && (
            <Box>
              {!validation.canEnrich ? (
                <Alert status="warning" mb={4}>
                  <AlertIcon />
                  <VStack align="start" spacing={2} width="full">
                    <Text fontWeight="medium">Partial enrichment may be possible</Text>
                    <Text>
                      Not all enrichment rules can run with current mappings, but some rules may still apply.
                    </Text>
                    <Divider my={2} />
                    <Text fontWeight="medium">Rule Status:</Text>
                    {Object.entries(validation.ruleValidations).map(([ruleName, ruleValidation]) => (
                      renderRuleValidation(ruleName, ruleValidation)
                    ))}
                  </VStack>
                </Alert>
              ) : (
                <Alert status="success" mb={4}>
                  <AlertIcon />
                  <VStack align="start" spacing={2} width="full">
                    <Text fontWeight="medium">Ready for enrichment</Text>
                    <Text>
                      At least one rule can run with the current field mappings.
                    </Text>
                    <Divider my={2} />
                    <Text fontWeight="medium">Rule Status:</Text>
                    {Object.entries(validation.ruleValidations).map(([ruleName, ruleValidation]) => (
                      renderRuleValidation(ruleName, ruleValidation)
                    ))}
                  </VStack>
                </Alert>
              )}
            </Box>
          )}

          {/* Enrichment Status */}
          {enrichmentStatus && (
            <>
              <HStack justify="space-between">
                <HStack>
                  <Box color={getStatusColor(enrichmentStatus.status)}>
                    {getStatusIcon(enrichmentStatus.status)}
                  </Box>
                  <Text fontWeight="medium">
                    Enrichment Status
                  </Text>
                </HStack>
                <Badge colorScheme={getStatusColor(enrichmentStatus.status)}>
                  {enrichmentStatus.status.charAt(0).toUpperCase() + enrichmentStatus.status.slice(1)}
                </Badge>
              </HStack>

              {/* Progress Bar */}
              {(enrichmentStatus.status === EnrichmentStatus.RUNNING || 
                enrichmentStatus.status === EnrichmentStatus.PENDING) && (
                <>
                  <Progress 
                    value={enrichmentStatus.progress.percentComplete} 
                    size="sm"
                    colorScheme="blue"
                  />
                  <HStack justify="space-between" fontSize="sm" color="gray.600">
                    <Text>
                      {enrichmentStatus.progress.processedRecords} of {enrichmentStatus.progress.totalRecords} records
                    </Text>
                    <Text>{enrichmentStatus.progress.percentComplete}% complete</Text>
                  </HStack>
                </>
              )}

              {/* Rule Statistics for Completed or Error Status */}
              {enrichmentStatus.errorDetails?.ruleStats && (
                <Box mt={4}>
                  <Text fontWeight="medium" mb={2}>Rule Application Statistics:</Text>
                  <VStack align="stretch" spacing={2}>
                    {enrichmentStatus.errorDetails.ruleStats.map(stat => (
                      <HStack key={stat.ruleId} justify="space-between">
                        <Text>{stat.ruleName}</Text>
                        <Badge colorScheme={stat.succeeded > 0 ? 'green' : 'red'}>
                          {stat.succeeded} / {stat.attempted} records ({Math.round(stat.successRate)}%)
                        </Badge>
                      </HStack>
                    ))}
                  </VStack>
                </Box>
              )}

              {/* Error details */}
              {enrichmentStatus.status === EnrichmentStatus.ERROR && (
                <Alert status="error">
                  <AlertIcon />
                  <VStack align="start" spacing={1}>
                    <Text fontWeight="medium">Enrichment Failed</Text>
                    <Text>{enrichmentStatus.errorDetails?.message || 'Unknown error occurred'}</Text>
                  </VStack>
                </Alert>
              )}
            </>
          )}

          {pollError && (
            <Alert status="error">
              <AlertIcon />
              <VStack align="start" spacing={1}>
                <Text fontWeight="medium">Status Update Error</Text>
                <Text>{pollError}</Text>
              </VStack>
            </Alert>
          )}
        </VStack>
      </CardBody>
    </Card>
  );
}