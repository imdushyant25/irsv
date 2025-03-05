// File: src/app/opportunities/[opportunityId]/files/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { 
  Box, 
  Container, 
  Heading, 
  VStack,
  useToast,
  Divider
} from '@chakra-ui/react';
import { FileUpload } from '@/components/files/FileUpload';
import { FileList } from '@/components/files/FileList';
import { FileRecord } from '@/types/file';

interface FilesPageProps {
  params: {
    opportunityId: string;
  };
}

export default function FilesPage({ params }: FilesPageProps) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const fetchFiles = async () => {
    try {
      const response = await fetch(`/api/opportunities/${params.opportunityId}/files`);
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
  };

  useEffect(() => {
    fetchFiles();
  }, [params.opportunityId]);

  const handleUploadComplete = (fileId: string) => {
    fetchFiles(); // Refresh the file list
  };

  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={8} align="stretch">
        <Heading size="lg">Claims Files</Heading>
        
        <Box 
          p={6} 
          bg="white" 
          shadow="sm" 
          borderRadius="lg"
        >
          <FileUpload 
            opportunityId={params.opportunityId}
            onUploadComplete={handleUploadComplete}
          />
        </Box>

        <Divider />

        <Box 
          p={6} 
          bg="white" 
          shadow="sm" 
          borderRadius="lg"
        >
          <FileList 
            files={files}
            opportunityId={params.opportunityId}
          />
        </Box>
      </VStack>
    </Container>
  );
}