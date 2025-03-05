// File: src/app/opportunities/[opportunityId]/components/tabs/FilesTab.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { 
  VStack,
  HStack,
  Box,
  Heading,
  useToast,
  Card,
  CardHeader,
  CardBody,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Text,
} from '@chakra-ui/react';
import { Upload, Plus } from 'lucide-react';
import { FileUpload } from '@/components/files/FileUpload';
import { FileList } from '@/components/files/FileList';
import { FileRecord } from '@/types/file';

interface FilesTabProps {
  opportunityId: string;
}

export default function FilesTab({ opportunityId }: FilesTabProps) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Add a refresh trigger state
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  // Using useCallback to memoize the fetchFiles function
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/opportunities/${opportunityId}/files`);
      if (!response.ok) throw new Error('Failed to fetch files');
      
      const data = await response.json();
      setFiles(data.data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load files',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [opportunityId, toast]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles, refreshTrigger]); // Add refreshTrigger as a dependency

  const handleUploadComplete = () => {
    fetchFiles();
    onClose();
    toast({
      title: 'Success',
      description: 'File uploaded successfully',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  // Function to trigger a refresh
  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1); // Increment the trigger to force a refresh
  };

  return (
    <VStack spacing={6} align="stretch">
      {/* Header with Upload Button */}
      <HStack justify="space-between" align="center">
        <Heading size="md">Claims Files</Heading>
        <Button
          leftIcon={<Plus size={16} />}
          colorScheme="blue"
          onClick={onOpen}
        >
          Upload File
        </Button>
      </HStack>

      {/* Files List */}
      <Card>
        <CardBody>
          <FileList 
            files={files}
            opportunityId={opportunityId}
            isLoading={loading}
            onFileAction={handleRefresh}
            forceRefresh={refreshTrigger} // Pass the trigger to force refresh
          />
        </CardBody>
      </Card>

      {/* Upload Modal */}
      <Modal 
        isOpen={isOpen} 
        onClose={onClose}
        size="xl"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <Upload size={20} />
              <Text>Upload Claims File</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <FileUpload 
              opportunityId={opportunityId}
              onUploadComplete={handleUploadComplete}
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </VStack>
  );
}