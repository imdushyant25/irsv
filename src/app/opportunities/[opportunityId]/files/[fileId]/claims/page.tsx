// File: src/app/opportunities/[opportunityId]/files/[fileId]/claims/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Container,
  Box,
  Heading,
  Text,
  HStack,
  VStack,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Button,
  useToast,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Spinner,
  Alert,
  AlertIcon,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Input,
  Select,
  FormControl,
  FormLabel,
  ButtonGroup,
  IconButton,
  Tooltip,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
} from '@chakra-ui/react';
import { 
  ChevronLeft, 
  ChevronRight,
  FileText,
  Download,
  Filter,
  Search,
  MoreVertical,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { FileRecord, FileStatus } from '@/types/file';
import { formatDate, formatFileSize } from '@/utils/format';
import { ClaimsTable } from '@/components/claims/ClaimsTable';
import { ClaimsSummary } from '@/components/claims/ClaimsSummary';
import { ClaimsFilter } from '@/components/claims/ClaimsFilter';

interface ClaimRecord {
  recordId: string;
  rowNumber: number;
  mappedFields: Record<string, any>;
  unmappedFields: Record<string, any>;
  validationStatus: string;
  processingStatus: string;
  createdAt: string;
}

interface ClaimsPageProps {}

export default function ClaimsPage({}: ClaimsPageProps) {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  
  const [file, setFile] = useState<FileRecord | null>(null);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    validationStatus: '',
    processingStatus: '',
    searchTerm: ''
  });

  // Fetch file details and claims data
  useEffect(() => {
    if (!params?.fileId || !params?.opportunityId) {
      setError('Invalid file or opportunity ID');
      setLoading(false);
      return;
    }

    Promise.all([
      fetchFileDetails(),
      fetchClaims()
    ]).catch(error => {
      setError(error instanceof Error ? error.message : 'Failed to load data');
      setLoading(false);
    });
  }, [params?.fileId, params?.opportunityId]);

  const fetchFileDetails = async () => {
    const response = await fetch(`/api/files/${params.fileId}`);
    if (!response.ok) throw new Error('Failed to fetch file details');
    const data = await response.json();
    setFile(data);
  };

  const fetchClaims = async () => {
    try {
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        validationStatus: filters.validationStatus,
        processingStatus: filters.processingStatus,
        search: filters.searchTerm
      });

      const response = await fetch(
        `/api/files/${params.fileId}/claims?${queryParams.toString()}`
      );
      
      if (!response.ok) throw new Error('Failed to fetch claims');
      
      const data = await response.json();
      setClaims(data.claims);
      setTotalPages(data.totalPages);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching claims:', error);
      throw error;
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch(
        `/api/files/${params.fileId}/claims/export`,
        { method: 'POST' }
      );
      
      if (!response.ok) throw new Error('Failed to initiate export');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `claims_${params.fileId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: 'Export Successful',
        description: 'Claims data has been exported',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'Failed to export claims',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    fetchClaims().catch(error => {
      toast({
        title: 'Refresh Failed',
        description: error instanceof Error ? error.message : 'Failed to refresh claims',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      setLoading(false);
    });
  };

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filters change
    setLoading(true);
    fetchClaims().catch(error => {
      toast({
        title: 'Filter Failed',
        description: error instanceof Error ? error.message : 'Failed to apply filters',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      setLoading(false);
    });
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
    <Container maxW="container.xl" py={8}>
      {/* Breadcrumb Navigation */}
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
            <BreadcrumbLink as={Link} href={`/opportunities/${params.opportunityId}/files`}>
              Files
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem isCurrentPage>
            <Text>Claims</Text>
          </BreadcrumbItem>
        </Breadcrumb>
      </Box>

      {/* File Details Card */}
      <Card mb={6}>
        <CardHeader>
          <HStack justify="space-between">
            <VStack align="start" spacing={1}>
              <Heading size="md">{file.originalFilename}</Heading>
              <HStack spacing={4} color="gray.600">
                <Text>Uploaded: {formatDate(file.uploadDate)}</Text>
                <Text>Size: {formatFileSize(file.fileSize)}</Text>
                <Text>Total Claims: {file.rowCount}</Text>
              </HStack>
            </VStack>
            <Badge 
              colorScheme={file.status === FileStatus.PROCESSED ? 'green' : 'yellow'}
              fontSize="sm"
              px={3}
              py={1}
              borderRadius="full"
            >
              {file.status}
            </Badge>
          </HStack>
        </CardHeader>
      </Card>

      {/* Claims Data Section */}
      <Tabs variant="enclosed">
        <TabList>
          <Tab>Claims Data</Tab>
          <Tab>Summary</Tab>
        </TabList>

        <TabPanels>
          <TabPanel px={0}>
            {/* Actions Bar */}
            <HStack mb={4} justify="space-between">
              <HStack spacing={4}>
                <ClaimsFilter
                  filters={filters}
                  onChange={handleFilterChange}
                />
                <ButtonGroup size="sm" isAttached variant="outline">
                  <Button
                    leftIcon={<Download size={16} />}
                    onClick={handleExport}
                  >
                    Export
                  </Button>
                  <IconButton
                    aria-label="Refresh data"
                    icon={<RefreshCw size={16} />}
                    onClick={handleRefresh}
                  />
                </ButtonGroup>
              </HStack>
            </HStack>

            {/* Claims Table */}
            <ClaimsTable
              claims={claims}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              isLoading={loading}
            />
          </TabPanel>

          <TabPanel px={0}>
            <ClaimsSummary fileId={file.fileId} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Container>
  );
}