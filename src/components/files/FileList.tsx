// File: src/components/files/FileList.tsx (updated version)

import React, { useState, useEffect } from 'react';
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  IconButton,
  Tooltip,
  Text,
  Spinner,
  Center,
  Button,
  HStack,
  useDisclosure,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  VStack,
  AlertIcon,
  Alert
} from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { 
  FileRecord, 
  FileStatus, 
  ProcessingStage,
  getFileStatusDisplay,
  getProcessingStageDisplay,
  isFileProcessingComplete,
  canProcessFile 
} from '@/types/file';
import { FileText, AlertCircle, ArrowRight, Play, Wand2 } from 'lucide-react';
import { formatFileSize, formatDate } from '@/utils/format';
import ProcessingStatus from '@/components/processing/ProcessingStatus';
import EnrichmentStatus from '@/components/processing/EnrichmentStatus';

export interface FileListProps {
  files: FileRecord[];
  opportunityId: string;
  isLoading?: boolean;
  onFileAction?: () => void;
  showMappingAction?: boolean;
  actionLabel?: string;
  forceRefresh?: number; // Added to force re-render when parent changes
}

export function FileList({ 
  files, 
  opportunityId, 
  isLoading = false,
  onFileAction,
  showMappingAction = false,
  actionLabel = "Map Fields",
  forceRefresh
}: FileListProps) {
  const router = useRouter();
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [processingFileId, setProcessingFileId] = useState<string | null>(null);
  const [enrichingFileId, setEnrichingFileId] = useState<string | null>(null);
  const [confirmEnrichFile, setConfirmEnrichFile] = useState<string | null>(null);
  const [currentFiles, setCurrentFiles] = useState<FileRecord[]>(files);

  // Update local files state when props change or forceRefresh changes
  useEffect(() => {
    setCurrentFiles(files);
  }, [files, forceRefresh]);

  // Function to manually refresh files
  const refreshFiles = async () => {
    try {
      const response = await fetch(`/api/opportunities/${opportunityId}/files`);
      if (!response.ok) throw new Error('Failed to fetch files');
      
      const data = await response.json();
      setCurrentFiles(data.data);
      onFileAction?.();
    } catch (error) {
      console.error('Error refreshing files:', error);
    }
  };

  const handleFileSelect = (file: FileRecord) => {
    switch (file.status) {
      case FileStatus.PROCESSED:
      case FileStatus.ENRICHED:
        router.push(`/opportunities/${opportunityId}/files/${file.fileId}/claims`);
        break;
      case FileStatus.MAPPED:
      case FileStatus.PROCESSING:
      case FileStatus.PROCESSING_CLAIMS:
        router.push(`/opportunities/${opportunityId}/files/${file.fileId}/mapping`);
        break;
      default:
        router.push(`/opportunities/${opportunityId}/files/${file.fileId}`);
        break;
    }
  };

  const handleProcessFile = async (fileId: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}/process`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to start processing');
      }

      setProcessingFileId(fileId);
      
      toast({
        title: 'Processing Started',
        description: 'File processing has been initiated',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Error starting processing:', error);
      toast({
        title: 'Processing Failed',
        description: error instanceof Error ? error.message : 'Failed to start processing',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleEnrichFile = async (fileId: string) => {
    try {
      setEnrichingFileId(fileId);
      
      // Validate enrichment capability
      const validateResponse = await fetch(`/api/files/${fileId}/enrichment/validate`);
      if (!validateResponse.ok) {
        throw new Error('Failed to validate enrichment');
      }
      
      const validationData = await validateResponse.json();
      if (!validationData.canEnrich) {
        setEnrichingFileId(null);
        toast({
          title: 'Cannot Enrich File',
          description: `Missing required fields: ${validationData.missingFields.join(', ')}`,
          status: 'warning',
          duration: 5000,
          isClosable: true,
        });
        return;
      }

      // Show confirmation dialog
      setConfirmEnrichFile(fileId);
    } catch (error) {
      setEnrichingFileId(null);
      toast({
        title: 'Enrichment Validation Failed',
        description: error instanceof Error ? error.message : 'Failed to validate enrichment',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const confirmAndStartEnrichment = async () => {
    if (!confirmEnrichFile) return;
    
    try {
      setConfirmEnrichFile(null);
      const response = await fetch(`/api/files/${confirmEnrichFile}/enrichment`, {
        method: 'POST'
      });
  
      if (!response.ok) {
        throw new Error('Failed to start enrichment');
      }
  
      // Keep the enrichingFileId set so status component shows
      // Only set confirmEnrichFile to null
      
      toast({
        title: 'Enrichment Started',
        description: 'Data enrichment has been initiated',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
  
    } catch (error) {
      toast({
        title: 'Enrichment Failed',
        description: error instanceof Error ? error.message : 'Failed to start enrichment',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      setEnrichingFileId(null); // Only clear if there's an error
    }
  };

  const getStatusColor = (status: FileStatus): string => {
    switch (status) {
      case FileStatus.PENDING:
        return 'yellow';
      case FileStatus.PROCESSING:
      case FileStatus.PROCESSING_CLAIMS:
        return 'blue';
      case FileStatus.MAPPED:
        return 'green';
      case FileStatus.ERROR:
        return 'red';
      case FileStatus.PROCESSED:
        return 'purple';
      case FileStatus.ENRICHED:
        return 'teal'; // Use teal color for enriched status
      default:
        return 'gray';
    }
  };


  if (isLoading) {
    return (
      <Center py={8}>
        <Spinner size="xl" />
      </Center>
    );
  }

  return (
    <>
      <Box overflowX="auto">
        <Table variant="simple">
          <Thead>
            <Tr>
              <Th>File Name</Th>
              <Th>Upload Date</Th>
              <Th>Size</Th>
              <Th>Status</Th>
              <Th>Processing Stage</Th>
              <Th>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {currentFiles.map((file) => (
              <React.Fragment key={file.fileId}>
                <Tr
                  onClick={() => handleFileSelect(file)}
                  _hover={{ bg: 'gray.50', cursor: 'pointer' }}
                >
                  <Td><Text noOfLines={1}>{file.originalFilename}</Text></Td>
                  <Td>{formatDate(file.uploadDate)}</Td>
                  <Td>{formatFileSize(file.fileSize)}</Td>
                  <Td>
                    <Badge colorScheme={getStatusColor(file.status)}>
                      {getFileStatusDisplay(file.status)}
                    </Badge>
                  </Td>
                  <Td>
                    <Text fontSize="sm">
                      {getProcessingStageDisplay(file.processingStage)}
                    </Text>
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <HStack spacing={2}>
                      {file.status === FileStatus.PROCESSED || file.status === FileStatus.ENRICHED ? (
                        <>
                          <Button
                            size="sm"
                            leftIcon={<FileText size={16} />}
                            onClick={() => router.push(`/opportunities/${opportunityId}/files/${file.fileId}/claims`)}
                            colorScheme="purple"
                            variant="outline"
                          >
                            View Claims
                          </Button>
                          {file.status !== FileStatus.ENRICHED && (
                          <Button
                            size="sm"
                            leftIcon={<Wand2 size={16} />}
                            onClick={() => handleEnrichFile(file.fileId)}
                            colorScheme="purple"
                            variant="outline"
                            isLoading={enrichingFileId === file.fileId}
                          >
                            Enrich Data
                          </Button>
                        )}
                        </>
                      ) : (
                        <>
                          {showMappingAction && (
                            <Button
                              size="sm"
                              leftIcon={<ArrowRight size={16} />}
                              onClick={() => router.push(`/opportunities/${opportunityId}/files/${file.fileId}/mapping`)}
                              colorScheme="blue"
                              variant="outline"
                              isDisabled={file.status === FileStatus.PROCESSING_CLAIMS}
                            >
                              {actionLabel}
                            </Button>
                          )}

                          {file.status === FileStatus.MAPPED && (
                            <Button
                              size="sm"
                              leftIcon={<Play size={16} />}
                              onClick={() => handleProcessFile(file.fileId)}
                              colorScheme="green"
                              variant="outline"
                            >
                              Process File
                            </Button>
                          )}
                        </>
                      )}

                      {file.status === FileStatus.ERROR && (
                        <Tooltip label="View error details">
                          <IconButton
                            aria-label="View error details"
                            icon={<AlertCircle size={18} />}
                            size="sm"
                            variant="ghost"
                            colorScheme="red"
                            onClick={onOpen}
                          />
                        </Tooltip>
                      )}
                    </HStack>
                  </Td>
                </Tr>
                
                {processingFileId === file.fileId && (
                  <Tr>
                    <Td colSpan={6} bg="gray.50" p={4}>
                      <ProcessingStatus
                        fileId={file.fileId}
                        onComplete={() => {
                          setProcessingFileId(null);
                          // After completion, refresh the file list
                          refreshFiles();
                          onFileAction?.();
                        }}
                        onError={() => {
                          setProcessingFileId(null);
                          refreshFiles();
                          onFileAction?.();
                        }}
                      />
                    </Td>
                  </Tr>
                )}

              {enrichingFileId === file.fileId && (
                <Tr>
                  <Td colSpan={6} bg="gray.50" p={4}>
                    <EnrichmentStatus
                      fileId={file.fileId}
                      onComplete={() => {
                        setEnrichingFileId(null);
                        refreshFiles();
                        onFileAction?.();
                      }}
                      onError={() => {
                        setEnrichingFileId(null);
                        refreshFiles();
                        onFileAction?.();
                      }}
                    />
                  </Td>
                </Tr>
              )}
              </React.Fragment>
            ))}
            
            {currentFiles.length === 0 && (
              <Tr>
                <Td colSpan={6}>
                  <Box py={8} textAlign="center">
                    <Text color="gray.500">No files found</Text>
                  </Box>
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Box>

      {/* Enrichment Confirmation Modal */}
      <Modal isOpen={!!confirmEnrichFile} onClose={() => setConfirmEnrichFile(null)}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Confirm Data Enrichment</ModalHeader>
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Text>
                Are you sure you want to start the data enrichment process? This will:
              </Text>
              <VStack align="start" pl={4} spacing={2}>
                <Text>• Calculate age-related fields for all claims</Text>
                <Text>• Add classification flags to the data</Text>
                <Text>• Update existing enriched fields if present</Text>
              </VStack>
              <Alert status="info" size="sm">
                <AlertIcon />
                This process cannot be undone
              </Alert>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setConfirmEnrichFile(null)}>
              Cancel
            </Button>
            <Button colorScheme="purple" onClick={confirmAndStartEnrichment}>
              Start Enrichment
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}