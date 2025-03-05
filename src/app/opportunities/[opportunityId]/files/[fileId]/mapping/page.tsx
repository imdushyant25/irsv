// File: src/app/opportunities/[opportunityId]/files/[fileId]/mapping/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Heading,
  Text,
  Spinner,
  Alert,
  AlertIcon,
  Button,
  useToast,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
} from '@chakra-ui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import EnhancedMappingInterface from '@/components/mapping/EnhancedMappingInterface';
import FileStatusGuard from '@/components/guards/FileStatusGuard';
import { FileRecord, FileStatus } from '@/types/file';

// Define allowed statuses for mapping
const ALLOWED_MAPPING_STATUSES = [
  FileStatus.PENDING,
  FileStatus.PROCESSING,
  FileStatus.MAPPED,
  FileStatus.ERROR
];

export default function MappingPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const [file, setFile] = useState<FileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.fileId || !params?.opportunityId) {
      setError('Invalid file or opportunity ID');
      setLoading(false);
      return;
    }

    fetchFileDetails();
  }, [params?.fileId, params?.opportunityId]);

  const fetchFileDetails = async () => {
    try {
      const response = await fetch(`/api/files/${params.fileId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch file details');
      }
      const data = await response.json();
      setFile(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load file details');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container maxW="container.xl" centerContent py={10}>
        <Spinner size="xl" />
      </Container>
    );
  }

  if (error || !file) {
    return (
      <Container maxW="container.xl" py={10}>
        <Alert status="error">
          <AlertIcon />
          {error || 'File not found'}
        </Alert>
        <Button
          leftIcon={<ChevronLeft />}
          mt={4}
          onClick={() => router.back()}
        >
          Back
        </Button>
      </Container>
    );
  }

  return (
    <FileStatusGuard
      fileId={file.fileId}
      status={file.status}
      opportunityId={params.opportunityId as string}
      allowedStatuses={ALLOWED_MAPPING_STATUSES}
    >
      <Container maxW="container.xl" py={8}>
        {/* Breadcrumb Navigation - FIXED: Modified Files link to point to the Files tab */}
        <Box mb={6}>
          <Breadcrumb
            spacing="8px"
            separator={<ChevronRight size={16} />}
          >
            <BreadcrumbItem>
              <BreadcrumbLink as={Link} href="/opportunities">
                Opportunities
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <BreadcrumbLink as={Link} href={`/opportunities/${params.opportunityId}`}>
                Opportunity
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem>
              {/* Modified to include the ?tab=files query parameter */}
              <BreadcrumbLink as={Link} href={`/opportunities/${params.opportunityId}?tab=files`}>
                Files
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem isCurrentPage>
              <Text>Map Fields</Text>
            </BreadcrumbItem>
          </Breadcrumb>
        </Box>

        {/* Header */}
        <Box mb={6}>
          <Heading size="lg">Map Fields</Heading>
          <Text color="gray.600" mt={2}>
            {file.originalFilename}
          </Text>
        </Box>

        {/* Mapping Interface */}
        <EnhancedMappingInterface
          fileId={params.fileId as string}
          sourceHeaders={file.originalHeaders}
          onSaveMapping={async (mapping) => {
            try {
              const response = await fetch(`/api/files/${params.fileId}/mapping`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ mapping }),
              });

              if (!response.ok) {
                throw new Error('Failed to save mapping');
              }

              toast({
                title: 'Success',
                description: 'Mapping saved successfully',
                status: 'success',
                duration: 3000,
                isClosable: true,
              });

              // Navigate back to the files tab with mapping selected
              router.push(`/opportunities/${params.opportunityId}?tab=files`);
            } catch (error) {
              toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to save mapping',
                status: 'error',
                duration: 5000,
                isClosable: true,
              });
            }
          }}
        />
      </Container>
    </FileStatusGuard>
  );
}