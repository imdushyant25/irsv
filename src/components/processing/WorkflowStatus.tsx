// File: src/components/processing/WorkflowStatus.tsx

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
  useToast,
  Step,
  StepDescription,
  StepIcon,
  StepIndicator,
  StepNumber,
  StepSeparator,
  StepStatus,
  StepTitle,
  Stepper,
  Flex
} from '@chakra-ui/react';
import { 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  File, 
  Database, 
  BarChart4, 
  DollarSign, 
  Tag 
} from 'lucide-react';

// Workflow stages enum - must match the enum in the Lambda
enum WorkflowStage {
  INITIALIZING = 'INITIALIZING',
  PROCESSING = 'PROCESSING',  
  ENRICHING = 'ENRICHING',    
  EXCLUSIONS = 'EXCLUSIONS',  
  SAVINGS = 'SAVINGS',        
  PRICING = 'PRICING',        
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

// Type for workflow status
interface WorkflowStatus {
  workflowId: string;
  fileId: string;
  opportunityId: string;
  stage: WorkflowStage;
  progress: number;
  details: {
    stages: Record<string, {
      status: 'pending' | 'in_progress' | 'completed' | 'error';
      timestamp?: string;
      completedAt?: string;
    }>;
    error?: {
      message: string;
      timestamp: string;
      stack?: string;
    };
  };
  startedAt: string;
  completedAt?: string;
}

interface WorkflowStatusComponentProps {
  fileId: string;
  opportunityId: string;
  onComplete?: () => void;
  onError?: (error: any) => void;
}

export default function WorkflowStatusComponent({ 
  fileId, 
  opportunityId,
  onComplete,
  onError 
}: WorkflowStatusComponentProps) {
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const toast = useToast();

  // Start the workflow
  const startWorkflow = async () => {
    setIsStarting(true);
    setError(null);
    
    try {
      const response = await fetch('/api/files/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileId,
          opportunityId,
          action: 'start'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start workflow');
      }

      const data = await response.json();
      
      if (data.workflowId) {
        setWorkflowId(data.workflowId);
        setIsPolling(true);
      } else {
        throw new Error('No workflow ID returned');
      }
      
      toast({
        title: 'Processing Started',
        description: 'File processing workflow has been started',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Error starting workflow:', error);
      setError(error instanceof Error ? error.message : 'Failed to start workflow');
      onError?.(error);
      
      toast({
        title: 'Start Failed',
        description: 'Failed to start processing workflow',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsStarting(false);
    }
  };

  // Poll the workflow status
  const pollStatus = async () => {
    if (!workflowId) return;
    
    try {
      const response = await fetch('/api/files/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileId,
          opportunityId,
          workflowId,
          action: 'status'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch workflow status');
      }

      const data = await response.json();
      setWorkflowStatus(data);

      // Check if workflow is completed or in error
      if (data.stage === WorkflowStage.COMPLETED) {
        setIsPolling(false);
        onComplete?.();
        
        toast({
          title: 'Processing Complete',
          description: 'File has been fully processed',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      } else if (data.stage === WorkflowStage.ERROR) {
        setIsPolling(false);
        setError(data.details?.error?.message || 'An error occurred during processing');
        onError?.(data.details?.error);
      }
    } catch (error) {
      console.error('Error polling status:', error);
      setError(error instanceof Error ? error.message : 'Failed to check status');
    }
  };

  // Poll the status every 3 seconds
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isPolling && workflowId) {
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
  }, [isPolling, workflowId, fileId]);

  // Retry a failed workflow
  const handleRetry = async () => {
    if (!workflowId) return;
    
    try {
      setError(null);
      
      const response = await fetch('/api/files/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileId,
          opportunityId,
          workflowId,
          action: 'status',
          retry: true
        })
      });

      if (!response.ok) {
        throw new Error('Failed to retry workflow');
      }

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

  // Manual refresh button
  const handleRefresh = () => {
    pollStatus();
  };

  // Get stage-specific icons and colors
  const getStageDetails = (stage: WorkflowStage) => {
    switch (stage) {
      case WorkflowStage.PROCESSING:
        return { 
          icon: File, 
          color: 'blue', 
          label: 'Processing File',
          description: 'Parsing file contents'
        };
      case WorkflowStage.ENRICHING:
        return { 
          icon: Database, 
          color: 'purple', 
          label: 'Enriching Data',
          description: 'Adding contextual information'
        };
      case WorkflowStage.EXCLUSIONS:
        return { 
          icon: BarChart4, 
          color: 'teal', 
          label: 'Analyzing Exclusions',
          description: 'Identifying exclusion opportunities'
        };
      case WorkflowStage.SAVINGS:
        return { 
          icon: DollarSign, 
          color: 'green', 
          label: 'Calculating Savings',
          description: 'Determining potential savings'
        };
      case WorkflowStage.PRICING:
        return { 
          icon: Tag, 
          color: 'orange', 
          label: 'Pricing Analysis',
          description: 'Analyzing pricing data'
        };
      case WorkflowStage.COMPLETED:
        return { 
          icon: CheckCircle2, 
          color: 'green', 
          label: 'Complete',
          description: 'All processing finished'
        };
      case WorkflowStage.ERROR:
        return { 
          icon: AlertCircle, 
          color: 'red', 
          label: 'Error',
          description: 'An error occurred'
        };
      default:
        return { 
          icon: Spinner, 
          color: 'gray', 
          label: 'Initializing',
          description: 'Starting workflow'
        };
    }
  };

  // Get status for a step in the workflow
  const getStepStatus = (step: WorkflowStage) => {
    if (!workflowStatus) return 'incomplete';
    
    const stageInfo = workflowStatus.details?.stages?.[step];
    
    if (!stageInfo) return 'incomplete';
    
    if (stageInfo.status === 'completed') return 'complete';
    if (stageInfo.status === 'in_progress') return 'current';
    if (stageInfo.status === 'error') return 'error';
    
    return 'incomplete';
  };

  // Define the steps to display in the stepper
  const workflowSteps = [
    WorkflowStage.PROCESSING,
    WorkflowStage.ENRICHING,
    WorkflowStage.EXCLUSIONS,
    // Only include additional stages if they're enabled or in use
    ...(workflowStatus?.details?.stages?.[WorkflowStage.SAVINGS] ? [WorkflowStage.SAVINGS] : []),
    ...(workflowStatus?.details?.stages?.[WorkflowStage.PRICING] ? [WorkflowStage.PRICING] : []),
    WorkflowStage.COMPLETED
  ];

  // Get the current active step index
  const getActiveStep = () => {
    if (!workflowStatus) return 0;
    
    const stageIndex = workflowSteps.indexOf(workflowStatus.stage);
    return stageIndex >= 0 ? stageIndex : 0;
  };

  // Calculate overall progress percentage across stages
  const calculateOverallProgress = () => {
    if (!workflowStatus) return 0;
    
    // Define weights for each stage (adjust as needed)
    const weights: Record<WorkflowStage, number> = {
      [WorkflowStage.INITIALIZING]: 0,
      [WorkflowStage.PROCESSING]: 25,
      [WorkflowStage.ENRICHING]: 25,
      [WorkflowStage.EXCLUSIONS]: 20,
      [WorkflowStage.SAVINGS]: 15,
      [WorkflowStage.PRICING]: 15,
      [WorkflowStage.COMPLETED]: 0,
      [WorkflowStage.ERROR]: 0
    };
    
    // Start with progress from current stage
    let progress = 0;
    const currentStage = workflowStatus.stage;
    
    // Add 100% for completed stages
    Object.entries(workflowStatus.details.stages).forEach(([stage, info]) => {
      if (info.status === 'completed' && stage !== WorkflowStage.COMPLETED) {
        progress += weights[stage as WorkflowStage];
      }
    });
    
    // Add partial progress for current stage
    if (currentStage !== WorkflowStage.COMPLETED && currentStage !== WorkflowStage.ERROR) {
      progress += (workflowStatus.progress / 100) * weights[currentStage];
    }
    
    // If completed, return 100%
    if (currentStage === WorkflowStage.COMPLETED) {
      return 100;
    }
    
    return progress;
  };

  // Render the component
  if (!workflowId && !isStarting) {
    return (
      <Card>
        <CardBody>
          <VStack spacing={4}>
            <Text>
              Start processing to enrich and analyze this file
            </Text>
            <Button
              colorScheme="blue"
              onClick={startWorkflow}
              isLoading={isStarting}
            >
              Start Processing
            </Button>
          </VStack>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <VStack spacing={4} align="stretch">
          <HStack justify="space-between">
            <Text fontWeight="bold">Processing Status</Text>
            {workflowStatus && (
              <Badge 
                colorScheme={getStageDetails(workflowStatus.stage).color}
                fontSize="sm"
                px={2}
                py={1}
                borderRadius="md"
              >
                {getStageDetails(workflowStatus.stage).label}
              </Badge>
            )}
          </HStack>

          {/* Workflow Progress Bar */}
          {workflowStatus && workflowStatus.stage !== WorkflowStage.ERROR && (
            <Box>
              <Progress 
                value={calculateOverallProgress()} 
                size="sm" 
                colorScheme={getStageDetails(workflowStatus.stage).color}
                mb={3}
                borderRadius="md"
                hasStripe={workflowStatus.stage !== WorkflowStage.COMPLETED}
                isAnimated={workflowStatus.stage !== WorkflowStage.COMPLETED}
              />
              <HStack justify="space-between">
                <Text fontSize="sm" color="gray.600">
                  {workflowStatus.stage === WorkflowStage.COMPLETED 
                    ? 'Processing complete' 
                    : `${getStageDetails(workflowStatus.stage).label}: ${Math.round(workflowStatus.progress)}%`}
                </Text>
                <Text fontSize="sm" color="gray.600">
                  {calculateOverallProgress().toFixed(0)}% Complete
                </Text>
              </HStack>
            </Box>
          )}

          {/* Workflow Stepper */}
          {workflowStatus && (
            <Box my={6}>
              <Stepper 
                index={getActiveStep()} 
                colorScheme={getStageDetails(workflowStatus.stage).color}
                size="sm"
              >
                {workflowSteps.map((step, index) => {
                  const { icon: StepIcon, label, description } = getStageDetails(step);
                  const status = getStepStatus(step);
                  
                  return (
                    <Step key={step} status={status as any}>
                      <StepIndicator>
                        <StepStatus 
                          complete={<StepIcon size={16} />} 
                          active={<StepIcon size={16} />}
                          incomplete={<StepIcon size={16} />}
                        />
                      </StepIndicator>
                      <Box flexShrink={0}>
                        <StepTitle>{label}</StepTitle>
                        <StepDescription fontSize="xs">{description}</StepDescription>
                      </Box>
                      {index < workflowSteps.length - 1 && <StepSeparator />}
                    </Step>
                  );
                })}
              </Stepper>
            </Box>
          )}

          {/* Initializing State */}
          {(!workflowStatus || workflowStatus.stage === WorkflowStage.INITIALIZING) && !error && (
            <HStack>
              <Spinner size="sm" />
              <Text>
                Initializing workflow...
              </Text>
            </HStack>
          )}

          {/* Completed State */}
          {workflowStatus && workflowStatus.stage === WorkflowStage.COMPLETED && (
            <Alert status="success" variant="subtle">
              <AlertIcon as={CheckCircle2} />
              <Box>
                <AlertTitle>
                  Processing Complete
                </AlertTitle>
                <AlertDescription>
                  All data has been successfully processed and analyzed
                </AlertDescription>
              </Box>
            </Alert>
          )}

          {/* Error State */}
          {(error || (workflowStatus && workflowStatus.stage === WorkflowStage.ERROR)) && (
            <Alert status="error" variant="subtle">
              <AlertIcon as={AlertCircle} />
              <Box>
                <AlertTitle>Processing Error</AlertTitle>
                <AlertDescription>
                  {error || workflowStatus?.details?.error?.message || 'An unknown error occurred'}
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

          {/* Refresh button */}
          <Flex justify="flex-end">
            <Button 
              leftIcon={<RefreshCw size={16} />} 
              size="sm" 
              variant="outline" 
              onClick={handleRefresh}
            >
              Refresh Status
            </Button>
          </Flex>
        </VStack>
      </CardBody>
    </Card>
  );
}