// File: src/app/opportunities/[opportunityId]/files/[fileId]/claims/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  HStack,
  Icon,
  IconButton,
  Text,
  VStack,
  useDisclosure,
  useToast,
  Collapse,
  Card,
  CardBody,
  CardHeader,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Badge,
  Divider,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
} from '@chakra-ui/react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  FileText,
  Filter,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

// Import components
import { ClaimsTable } from '@/components/claims/ClaimsTable';
import { ClaimsFilter } from '@/components/claims/ClaimsFilter';
import ClaimDetailPanel from '@/components/claims/ClaimDetailPanel';
import ExclusionsTab from './components/ExclusionsTab';  // Import the new component

// Import types
import { FileRecord, FileStatus } from '@/types/file';
import { formatDate, formatFileSize } from '@/utils/format';

interface ClaimRecord {
  recordId: string;
  rowNumber: number;
  mappedFields: Record<string, any>;
  unmappedFields: Record<string, any>;
  validationStatus: string;
  processingStatus: string;
  createdAt: string;
}

export default function ClaimsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  
  // Get active tab from URL or default to "data"
  const activeTab = searchParams.get('tab') || 'data';
  
  // State management
  const [file, setFile] = useState<FileRecord | null>(null);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [filters, setFilters] = useState({
    validationStatus: '',
    processingStatus: '',
    searchTerm: ''
  });
  const [selectedClaim, setSelectedClaim] = useState<ClaimRecord | null>(null);
  
  // UI state management
  const { isOpen: isFilterOpen, onToggle: onToggleFilter } = useDisclosure();
  const { isOpen: isFileDetailsOpen, onToggle: onToggleFileDetails } = useDisclosure({ defaultIsOpen: true });
  const { isOpen: isDetailPanelOpen, onOpen: onOpenDetailPanel, onClose: onCloseDetailPanel } = useDisclosure();

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
      setLoading(true);
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: '25', // Reduced from default for better performance
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
      setTotalPages(data.pagination.totalPages);
      setTotalRecords(data.pagination.totalRecords);
    } catch (error) {
      console.error('Error fetching claims:', error);
      toast({
        title: 'Error',
        description: 'Failed to load claims data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle page changes
  useEffect(() => {
    if (params?.fileId) {
      fetchClaims();
    }
  }, [currentPage, params?.fileId]);

  // Handle tab change
  const handleTabChange = (tabValue: string) => {
    // Update URL with new tab parameter
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('tab', tabValue);
    router.push(`${window.location.pathname}?${newParams.toString()}`);
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
    fetchClaims();
  };

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filters change
    fetchClaims();
  };

  const handleViewClaim = (claim: ClaimRecord) => {
    setSelectedClaim(claim);
    onOpenDetailPanel();
  };

  const getStatusColor = (status: FileStatus): string => {
    switch (status) {
      case FileStatus.PROCESSED:
        return 'purple';
      case FileStatus.ENRICHED:
        return 'teal';
      case FileStatus.ERROR:
        return 'red';
      default:
        return 'blue';
    }
  };

  if (loading && !claims.length) {
    return (
      <Container maxW="container.xl" centerContent py={10}>
        <VStack spacing={4}>
          <Heading size="md">Loading Claims Data</Heading>
          <Text>Please wait while we load the claims data...</Text>
        </VStack>
      </Container>
    );
  }

  if (error || !file) {
    return (
      <Container maxW="container.xl" py={10}>
        <VStack spacing={4} align="start">
          <Heading size="md">Error</Heading>
          <Text color="red.500">{error || 'File not found'}</Text>
          <Button
            leftIcon={<ChevronLeft size={16} />}
            onClick={() => router.back()}
            size="sm"
            colorScheme="blue"
          >
            Back
          </Button>
        </VStack>
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={6}>
      {/* Breadcrumb Navigation */}
      <Breadcrumb
        spacing="8px"
        separator={<ChevronRight size={16} />}
        mb={6}
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
          <BreadcrumbLink as={Link} href={`/opportunities/${params.opportunityId}?tab=files`}>
            Files
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbItem isCurrentPage>
          <Text>Claims</Text>
        </BreadcrumbItem>
      </Breadcrumb>

      {/* File Details Card */}
      <Card mb={4} variant="outline">
        <CardHeader p={4}>
          <Flex justify="space-between" align="center">
            <HStack>
              <Icon as={FileText} color="blue.500" boxSize="20px" />
              <Heading size="md">{file.originalFilename}</Heading>
              <Badge colorScheme={getStatusColor(file.status)} ml={2}>
                {file.status}
              </Badge>
            </HStack>
            <Button
              size="sm"
              variant="ghost"
              rightIcon={isFileDetailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              onClick={onToggleFileDetails}
            >
              {isFileDetailsOpen ? "Hide Details" : "Show Details"}
            </Button>
          </Flex>
        </CardHeader>
        <Collapse in={isFileDetailsOpen}>
          <CardBody pt={0} pb={4} px={4}>
            <Divider mb={4} />
            <Flex 
              direction={{ base: "column", md: "row" }} 
              gap={4} 
              flexWrap="wrap"
            >
              <Box minW="200px">
                <Text fontSize="sm" fontWeight="medium" color="gray.500">File Information</Text>
                <Text fontSize="sm" mt={1}>Uploaded: {formatDate(file.uploadDate)}</Text>
                <Text fontSize="sm">Size: {formatFileSize(file.fileSize)}</Text>
                <Text fontSize="sm">Total Claims: {file.rowCount}</Text>
              </Box>
            </Flex>
          </CardBody>
        </Collapse>
      </Card>

      {/* Actions & Filters - Only show for Claims Data tab */}
      {activeTab === 'data' && (
        <Flex 
          mb={4} 
          wrap="wrap" 
          justify="space-between" 
          align="center"
          gap={2}
        >
          <HStack>
            <Button
              leftIcon={<Filter size={16} />}
              onClick={onToggleFilter}
              size="sm"
              colorScheme={isFilterOpen ? "blue" : "gray"}
              variant={isFilterOpen ? "solid" : "outline"}
            >
              Filter
            </Button>
            
            <Button
              leftIcon={<Download size={16} />}
              onClick={handleExport}
              size="sm"
              colorScheme="green"
              variant="outline"
            >
              Export
            </Button>
          </HStack>
          
          <HStack>
            <Text fontSize="sm" color="gray.600">
              Showing {claims.length} of {totalRecords.toLocaleString()} claims
            </Text>
            <IconButton
              aria-label="Refresh data"
              icon={<RefreshCw size={16} />}
              onClick={handleRefresh}
              size="sm"
              variant="ghost"
            />
          </HStack>
        </Flex>
      )}

      {/* Filters Panel - Only show for Claims Data tab */}
      {activeTab === 'data' && (
        <Collapse in={isFilterOpen} animateOpacity>
          <Card mb={4} variant="outline">
            <CardBody p={4}>
              <ClaimsFilter
                filters={filters}
                onChange={handleFilterChange}
                totalResults={totalRecords}
              />
            </CardBody>
          </Card>
        </Collapse>
      )}

      {/* Tabs Container */}
      <Tabs 
        variant="enclosed" 
        colorScheme="blue"
        index={activeTab === 'data' ? 0 : activeTab === 'exclusions' ? 1 : 0}
        onChange={(index) => handleTabChange(index === 0 ? 'data' : 'exclusions')}
      >
        <TabList>
          <Tab>Claims Data</Tab>
          <Tab>Clinical Savings</Tab>
        </TabList>

        <TabPanels>
          {/* Claims Data Tab */}
          <TabPanel px={0} py={4}>
            <ClaimsTable
              claims={claims}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              isLoading={loading}
              onViewDetails={handleViewClaim}
            />
          </TabPanel>
          
          {/* Exclusions Tab */}
          <TabPanel px={0} py={4}>
            <ExclusionsTab fileId={params.fileId as string} />
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Claim Detail Panel (Slide-out) */}
      {selectedClaim && (
        <ClaimDetailPanel 
          isOpen={isDetailPanelOpen} 
          onClose={onCloseDetailPanel} 
          claim={selectedClaim} 
        />
      )}
    </Container>
  );
}