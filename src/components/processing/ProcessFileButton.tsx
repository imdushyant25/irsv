// File: src/components/processing/ProcessFileButton.tsx

import React, { useState } from 'react';
import {
  Button,
  VStack,
  HStack,
  Radio,
  RadioGroup,
  Text,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  useToast
} from '@chakra-ui/react';
import { Play, Wand2 } from 'lucide-react';
import { FileStatus } from '@/types/file';

interface ProcessFileButtonProps {
  fileId: string;
  fileName: string;
  status: FileStatus;
  rowCount: number;
  onProcessingStart: () => void;
}

export default function ProcessFileButton({
  fileId,
  fileName,
  status,
  rowCount,
  onProcessingStart
}: ProcessFileButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMode, setProcessingMode] = useState<'standard' | 'combined'>('combined');
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  // Check if file can be processed
  const canProcess = status === FileStatus.MAPPED;

  const handleProcessClick = () => {
    if (!canProcess) {
      toast({
        title: 'Cannot Process File',
        description: 'File must be in mapped state to process',
        status: 'warning',
        duration: 5000,
        isClosable: true,
      });
      return;
    }
    
    // Open confirmation dialog
    onOpen();
  };

  const startProcessing = async () => {
    setIsProcessing(true);
    
    try {
      // Use the appropriate API endpoint based on processing mode
      const endpoint = processingMode === 'combined' 
        ? `/api/files/${fileId}/process-combined`
        : `/api/files/${fileId}/process`;
      
      const response = await fetch(endpoint, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start processing');
      }

      // Show success message
      toast({
        title: 'Processing Started',
        description: processingMode === 'combined' 
          ? 'Combined processing and enrichment has been initiated'
          : 'File processing has been initiated',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      
      // Notify parent component
      onProcessingStart();
      
      // Close the confirmation dialog
      onClose();
    } catch (error) {
      console.error('Error starting processing:', error);
      toast({
        title: 'Processing Failed',
        description: error instanceof Error ? error.message : 'Failed to start processing',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Button
        leftIcon={<Play size={16} />}
        colorScheme="green"
        onClick={handleProcessClick}
        isDisabled={!canProcess || isProcessing}
        title={canProcess ? "Process file" : "File is not ready for processing"}
      >
        Process File
      </Button>

      {/* Confirmation Dialog */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Process File</ModalHeader>
          <ModalBody>
            <VStack spacing={6} align="stretch">
              <Alert status="info">
                <AlertIcon />
                <AlertTitle>Important!</AlertTitle>
                <AlertDescription>
                  This will convert {rowCount.toLocaleString()} rows from "{fileName}" into claim records. 
                  This process cannot be reversed.
                </AlertDescription>
              </Alert>
              
              <RadioGroup onChange={(v) => setProcessingMode(v as 'standard' | 'combined')} value={processingMode}>
                <Text fontWeight="bold" mb={2}>Processing Mode:</Text>
                <VStack spacing={3} align="start">
                  <Radio value="standard">
                    <VStack align="start" spacing={0}>
                      <Text fontWeight="medium">Standard Processing</Text>
                      <Text fontSize="sm" color="gray.600">
                        Process claims first, then enrich data separately (two steps)
                      </Text>
                    </VStack>
                  </Radio>
                  
                  <Radio value="combined">
                    <HStack align="center">
                      <VStack align="start" spacing={0}>
                        <HStack>
                          <Text fontWeight="medium">Combined Processing & Enrichment</Text>
                          <Wand2 size={16} color="purple" />
                        </HStack>
                        <Text fontSize="sm" color="gray.600">
                          Process and enrich data in a single step (faster, recommended)
                        </Text>
                      </VStack>
                    </HStack>
                  </Radio>
                </VStack>
              </RadioGroup>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button 
              colorScheme="green" 
              onClick={startProcessing} 
              isLoading={isProcessing}
              loadingText="Starting..."
            >
              Process File
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}