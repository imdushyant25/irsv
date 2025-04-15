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
// Backend workflow stages
enum WorkflowStage {
  INITIALIZING = 'INITIALIZING',
  PROCESSING = 'PROCESSING',  
  ENRICHING = 'ENRICHING',    
  EXCLUSIONS = 'EXCLUSIONS',  
  FORMULARY_EXCLUSIONS = 'FORMULARY_EXCLUSIONS',
  WEIGHT_LOSS_SAVINGS = 'WEIGHT_LOSS_SAVINGS',
  SAVINGS = 'SAVINGS',        
  PRICING = 'PRICING',        
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

// UI workflow steps - simplified view for users
enum UIWorkflowStep {
  PROCESSING = 'PROCESSING',
  REPRICE = 'REPRICE',
  SAVINGS_ANALYSIS = 'SAVINGS_ANALYSIS',
  COMPLETED = 'COMPLETED'
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

  // Get UI step-specific icons and colors
  const getStepDetails = (uiStep: UIWorkflowStep | WorkflowStage) => {
    // If it's a backend stage, map it to UI step first
    if (Object.values(WorkflowStage).includes(uiStep as WorkflowStage)) {
      uiStep = mapStageToUIStep(uiStep as WorkflowStage);
    }
    
    switch (uiStep) {
      case UIWorkflowStep.PROCESSING:
        return { 
          icon: File, 
          color: 'blue', 
          label: 'Processing File',
          description: 'Parsing and loading data'
        };
      case UIWorkflowStep.REPRICE:
        return { 
          icon: Database, 
          color: 'purple', 
          label: 'Repricing',
          description: 'Calculating alternative pricing'
        };
      case UIWorkflowStep.SAVINGS_ANALYSIS:
        return { 
          icon: DollarSign, 
          color: 'green', 
          label: 'Savings Analysis',
          description: 'Calculating potential savings'
        };
      case UIWorkflowStep.COMPLETED:
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

  // Get status for a UI step in the workflow
  const getStepStatus = (uiStep: UIWorkflowStep) => {
    if (!workflowStatus) return 'incomplete';
    
    // Determine which backend stages correspond to this UI step
    let correspondingStages: WorkflowStage[] = [];
    
    switch (uiStep) {
      case UIWorkflowStep.PROCESSING:
        correspondingStages = [WorkflowStage.PROCESSING];
        break;
      case UIWorkflowStep.REPRICE:
        correspondingStages = [WorkflowStage.ENRICHING];
        break;
      case UIWorkflowStep.SAVINGS_ANALYSIS:
        correspondingStages = [
          WorkflowStage.EXCLUSIONS,
          WorkflowStage.FORMULARY_EXCLUSIONS,
          WorkflowStage.WEIGHT_LOSS_SAVINGS,
          WorkflowStage.SAVINGS,
          WorkflowStage.PRICING
        ];
        break;
      case UIWorkflowStep.COMPLETED:
        correspondingStages = [WorkflowStage.COMPLETED];
        break;
    }
    
    // If any corresponding stage is in progress, this UI step is current
    for (const stage of correspondingStages) {
      const stageInfo = workflowStatus.details?.stages?.[stage];
      if (stageInfo?.status === 'in_progress') {
        return 'current';
      }
    }
    
    // If any previous UI step has incomplete stages, this UI step is incomplete
    const currentUIStep = mapStageToUIStep(workflowStatus.stage);
    const currentUIStepIndex = workflowSteps.indexOf(currentUIStep);
    const thisUIStepIndex = workflowSteps.indexOf(uiStep);
    
    if (thisUIStepIndex > currentUIStepIndex) {
      return 'incomplete';
    }
    
    // If all corresponding stages are complete, this UI step is complete
    // For the COMPLETED step, use the actual workflow stage
    if (uiStep === UIWorkflowStep.COMPLETED) {
      return workflowStatus.stage === WorkflowStage.COMPLETED ? 'complete' : 'incomplete';
    }
    
    // For other steps, check if all are complete or we've moved past it
    const allComplete = correspondingStages.every(stage => {
      const stageInfo = workflowStatus.details?.stages?.[stage];
      return stageInfo?.status === 'completed';
    });
    
    if (allComplete || thisUIStepIndex < currentUIStepIndex) {
      return 'complete';
    }
    
    return 'incomplete';
  };

  // Define the simplified UI steps to display in the stepper
  const workflowSteps = [
    UIWorkflowStep.PROCESSING,
    UIWorkflowStep.REPRICE,
    UIWorkflowStep.SAVINGS_ANALYSIS,
    UIWorkflowStep.COMPLETED
  ];

  // Map backend stage to UI step
  const mapStageToUIStep = (stage: WorkflowStage): UIWorkflowStep => {
    switch (stage) {
      case WorkflowStage.PROCESSING:
        return UIWorkflowStep.PROCESSING;
      case WorkflowStage.ENRICHING:
        return UIWorkflowStep.REPRICE;
      case WorkflowStage.EXCLUSIONS:
      case WorkflowStage.FORMULARY_EXCLUSIONS:
      case WorkflowStage.WEIGHT_LOSS_SAVINGS:
      case WorkflowStage.SAVINGS:
      case WorkflowStage.PRICING:
        return UIWorkflowStep.SAVINGS_ANALYSIS;
      case WorkflowStage.COMPLETED:
        return UIWorkflowStep.COMPLETED;
      default:
        return UIWorkflowStep.PROCESSING;
    }
  };

  // Get the current active step index
  const getActiveStep = () => {
    if (!workflowStatus) return 0;
    
    // Map the current backend stage to UI step
    const currentUIStep = mapStageToUIStep(workflowStatus.stage);
    
    // Return the index of the current UI step
    const stepIndex = workflowSteps.indexOf(currentUIStep);
    return stepIndex >= 0 ? stepIndex : 0;
  };

  // Calculate overall progress percentage across UI steps
  const calculateOverallProgress = () => {
    if (!workflowStatus) return 0;
    
    // Define weights for UI steps (adjust as needed)
    const uiStepWeights: Record<UIWorkflowStep, number> = {
      [UIWorkflowStep.PROCESSING]: 30,
      [UIWorkflowStep.REPRICE]: 30,
      [UIWorkflowStep.SAVINGS_ANALYSIS]: 40,
      [UIWorkflowStep.COMPLETED]: 0
    };
    
    // Map backend stages to UI step weights
    const backendStageWeights: Record<WorkflowStage, number> = {
      [WorkflowStage.INITIALIZING]: 0,
      [WorkflowStage.PROCESSING]: uiStepWeights[UIWorkflowStep.PROCESSING],
      [WorkflowStage.ENRICHING]: uiStepWeights[UIWorkflowStep.REPRICE],
      // Divide the SAVINGS_ANALYSIS weight among its component stages
      [WorkflowStage.EXCLUSIONS]: uiStepWeights[UIWorkflowStep.SAVINGS_ANALYSIS] * 0.2,
      [WorkflowStage.FORMULARY_EXCLUSIONS]: uiStepWeights[UIWorkflowStep.SAVINGS_ANALYSIS] * 0.2,
      [WorkflowStage.WEIGHT_LOSS_SAVINGS]: uiStepWeights[UIWorkflowStep.SAVINGS_ANALYSIS] * 0.2,
      [WorkflowStage.SAVINGS]: uiStepWeights[UIWorkflowStep.SAVINGS_ANALYSIS] * 0.2,
      [WorkflowStage.PRICING]: uiStepWeights[UIWorkflowStep.SAVINGS_ANALYSIS] * 0.2,
      [WorkflowStage.COMPLETED]: 0,
      [WorkflowStage.ERROR]: 0
    };
    
    // Start with progress from current stage
    let progress = 0;
    const currentStage = workflowStatus.stage;
    const currentUIStep = mapStageToUIStep(currentStage);
    
    // Add 100% for completed UI steps
    const completedUISteps = new Set<UIWorkflowStep>();
    
    // Add completed backend stages' contributions
    Object.entries(workflowStatus.details.stages).forEach(([stage, info]) => {
      if (info.status === 'completed' && stage !== WorkflowStage.COMPLETED) {
        // Add this stage's weight to the progress
        progress += backendStageWeights[stage as WorkflowStage];
        
        // Mark this stage's UI step as completed
        const uiStep = mapStageToUIStep(stage as WorkflowStage);
        completedUISteps.add(uiStep);
      }
    });
    
    // Add partial progress for current stage
    if (currentStage !== WorkflowStage.COMPLETED && currentStage !== WorkflowStage.ERROR) {
      progress += (workflowStatus.progress / 100) * backendStageWeights[currentStage];
    }
    
    // If completed, return 100%
    if (currentStage === WorkflowStage.COMPLETED) {
      return 100;
    }
    
    return Math.min(progress, 99); // Cap at 99% until fully complete
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
                colorScheme={getStepDetails(workflowStatus.stage).color}
                fontSize="sm"
                px={2}
                py={1}
                borderRadius="md"
              >
                {getStepDetails(workflowStatus.stage).label}
              </Badge>
            )}
          </HStack>

          {/* Workflow Progress Bar */}
          {workflowStatus && workflowStatus.stage !== WorkflowStage.ERROR && (
            <Box>
              <Progress 
                value={calculateOverallProgress()} 
                size="sm" 
                colorScheme={getStepDetails(workflowStatus.stage).color}
                mb={3}
                borderRadius="md"
                hasStripe={workflowStatus.stage !== WorkflowStage.COMPLETED}
                isAnimated={workflowStatus.stage !== WorkflowStage.COMPLETED}
              />
              <HStack justify="space-between">
                <Text fontSize="sm" color="gray.600">
                  {workflowStatus.stage === WorkflowStage.COMPLETED 
                    ? 'Processing complete' 
                    : `${getStepDetails(workflowStatus.stage).label}: ${Math.round(workflowStatus.progress)}%`}
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
                colorScheme={getStepDetails(workflowStatus.stage).color}
                size="sm"
              >
                {workflowSteps.map((step, index) => {
                  const { icon: StepIcon, label, description } = getStepDetails(step);
                  const status = getStepStatus(step);
                  
                  return (
                    <Step key={step}>
                      <StepIndicator>
                        {status === 'complete' ? (
                          <StepIcon size="1em" />
                        ) : status === 'current' ? (
                          <StepIcon size="1em" />
                        ) : (
                          <StepIcon size="1em" />
                        )}
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
                    leftIcon={<RefreshCw size="1em" />}
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
              leftIcon={<RefreshCw size="1em" />} 
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