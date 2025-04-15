// File: src/app/opportunities/[opportunityId]/files/[fileId]/claims/components/ExclusionsTab.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Heading,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Checkbox,
  Card,
  CardHeader,
  CardBody,
  Spinner,
  Alert,
  AlertIcon,
  useToast,
  Divider,
  Flex,
  Switch,
  FormLabel,
  FormControl,
  SimpleGrid,
  Badge,
  Tooltip
} from '@chakra-ui/react';
import { RefreshCw, Filter, Info } from 'lucide-react';
import { formatCurrency } from '@/utils/format';

// Type for exclusion category data - updated to match new data structure from API
interface ExclusionCategory {
  // Original fields expected by the component
  category?: string;
  plan_cost_sum?: number;
  claim_count?: number;
  unique_member_count?: number;
  
  // New fields from the API
  exclusion_name?: string;
  exclusion_type?: string;
  total_plan_cost?: number;
  member_count?: number;
  sort_order?: number;
}

// Type for API response - maintains backward compatibility
interface ExclusionsResponse {
  exclusion_categories: ExclusionCategory[];
  optional_program_categories: ExclusionCategory[];
  total_plan_cost: number;
  other_awp_sum?: number | null;
}

interface ExclusionsTabProps {
  fileId: string;
}

// Component renamed internally, but keeping function name for backwards compatibility
export default function ExclusionsTab({ fileId }: ExclusionsTabProps) {
  // State for active tab
  const [activeTab, setActiveTab] = useState('clinical');
  
  const [planData, setPlanData] = useState<ExclusionsResponse | null>(null);
  const [formularyData, setFormularyData] = useState<any>(null);
  const [weightLossData, setWeightLossData] = useState<any>(null);
  const [diabetesData, setDiabetesData] = useState<any>(null);
  const [hdcrData, setHdcrData] = useState<any>(null);
  const [priorAuthData, setPriorAuthData] = useState<any>(null);
  const [qtyLimitData, setQtyLimitData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [formularyLoading, setFormularyLoading] = useState(true);
  const [weightLossLoading, setWeightLossLoading] = useState(true);
  const [diabetesLoading, setDiabetesLoading] = useState(true);
  const [hdcrLoading, setHdcrLoading] = useState(true);
  const [priorAuthLoading, setPriorAuthLoading] = useState(true);
  const [qtyLimitLoading, setQtyLimitLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formularyError, setFormularyError] = useState<string | null>(null);
  const [weightLossError, setWeightLossError] = useState<string | null>(null);
  const [diabetesError, setDiabetesError] = useState<string | null>(null);
  const [hdcrError, setHdcrError] = useState<string | null>(null);
  const [priorAuthError, setPriorAuthError] = useState<string | null>(null);
  const [qtyLimitError, setQtyLimitError] = useState<string | null>(null);
  
  const toast = useToast();

  // Fetch initial data
  useEffect(() => {
    fetchPlanExclusionsData();
    fetchFormularyExclusionsData();
    fetchWeightLossSavingsData();
    fetchDiabetesSavingsData();
    fetchHdcrSavingsData();
    fetchPriorAuthSavingsData();
    fetchQtyLimitSavingsData();
  }, [fileId]);

  // Calculate totals for a category group - supporting both old and new property names
  const calculateTotals = useCallback((categories: ExclusionCategory[]) => {
    return categories.reduce(
      (acc, category) => ({
        totalPlanCost: acc.totalPlanCost + (category.plan_cost_sum || category.total_plan_cost || 0),
        totalClaimCount: acc.totalClaimCount + (category.claim_count || 0),
        totalMemberCount: acc.totalMemberCount + Math.max(0, category.unique_member_count || category.member_count || 0),
      }),
      { totalPlanCost: 0, totalClaimCount: 0, totalMemberCount: 0 }
    );
  }, []);

  // Calculate grand totals across all categories
  const calculateGrandTotals = useCallback(() => {
    if (!planData) return { totalPlanCost: 0, totalClaimCount: 0, totalMemberCount: 0 };
    
    const planExclusionCategories = planData.exclusion_categories || [];
    const drugFlagCategories = planData.optional_program_categories || [];
    
    const allCategories = [...planExclusionCategories, ...drugFlagCategories];
    
    return calculateTotals(allCategories);
  }, [planData, calculateTotals]);

  // Fetch plan exclusions data from the savings API endpoint
  const fetchPlanExclusionsData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use the savings endpoint with plans category (matching what exclusionsProcessor saves)
      const response = await fetch(`/api/files/${fileId}/savings?category=plans`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch plan exclusions data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.data || !result.data.results) {
        throw new Error('Invalid response format from API');
      }
      
      // Extract the nested results data in the correct format for the component
      const resultsData = result.data.results.results;
      
      // Transform the data into the format expected by the component
      const transformedData = {
        exclusion_categories: resultsData.filter((item: ExclusionCategory) => 
          item.exclusion_type === 'Plan' && 
          item.exclusion_name !== 'TOTAL' && 
          item.sort_order === 1
        ),
        optional_program_categories: [], // Empty since we removed Drug Flags
        total_plan_cost: resultsData.find((item: ExclusionCategory) => 
          item.exclusion_type === 'OVERALL TOTAL' || 
          (item.exclusion_type === 'Plan' && item.exclusion_name === 'TOTAL')
        )?.total_plan_cost || 0
      };
      
      console.log('Plan exclusions data:', transformedData);
      
      setPlanData(transformedData);
    } catch (error) {
      console.error('Error fetching plan exclusions data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load plan exclusions data');
      
      toast({
        title: 'Error',
        description: 'Failed to load plan exclusions data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch formulary exclusions data from the savings API endpoint
  const fetchFormularyExclusionsData = async () => {
    setFormularyLoading(true);
    setFormularyError(null);
    
    try {
      // Use the savings endpoint with formulary category
      const response = await fetch(`/api/files/${fileId}/savings?category=formulary`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch formulary exclusions data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.data || !result.data.results) {
        throw new Error('Invalid response format from API');
      }
      
      console.log('Formulary exclusions data:', result.data.results);
      
      setFormularyData(result.data.results);
    } catch (error) {
      console.error('Error fetching formulary exclusions data:', error);
      setFormularyError(error instanceof Error ? error.message : 'Failed to load formulary exclusions data');
      
      toast({
        title: 'Error',
        description: 'Failed to load formulary exclusions data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setFormularyLoading(false);
    }
  };
  
  // Fetch weight loss savings data from the savings API endpoint
  const fetchWeightLossSavingsData = async () => {
    setWeightLossLoading(true);
    setWeightLossError(null);
    
    try {
      // Use the savings endpoint with the P1_GLP1_Wght_Loss category
      const response = await fetch(`/api/files/${fileId}/savings?category=P1_GLP1_Wght_Loss`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch weight loss savings data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.data || !result.data.results) {
        throw new Error('Invalid response format from API');
      }
      
      console.log('Weight loss savings data:', result.data.results);
      
      setWeightLossData(result.data.results);
    } catch (error) {
      console.error('Error fetching weight loss savings data:', error);
      setWeightLossError(error instanceof Error ? error.message : 'Failed to load weight loss savings data');
      
      toast({
        title: 'Error',
        description: 'Failed to load weight loss savings data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setWeightLossLoading(false);
    }
  };
  
  // Fetch diabetes savings data from the savings API endpoint
  const fetchDiabetesSavingsData = async () => {
    setDiabetesLoading(true);
    setDiabetesError(null);
    
    try {
      // Use the savings endpoint with the P1_GLP1_Diabetes category
      const response = await fetch(`/api/files/${fileId}/savings?category=P1_GLP1_Diabetes`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch diabetes savings data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.data || !result.data.results) {
        throw new Error('Invalid response format from API');
      }
      
      console.log('Diabetes savings data:', result.data.results);
      
      setDiabetesData(result.data.results);
    } catch (error) {
      console.error('Error fetching diabetes savings data:', error);
      setDiabetesError(error instanceof Error ? error.message : 'Failed to load diabetes savings data');
      
      toast({
        title: 'Error',
        description: 'Failed to load diabetes savings data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setDiabetesLoading(false);
    }
  };
  
  // Fetch HDCR savings data from the savings API endpoint
  const fetchHdcrSavingsData = async () => {
    setHdcrLoading(true);
    setHdcrError(null);
    
    try {
      // Use the savings endpoint with the hdcr category
      const response = await fetch(`/api/files/${fileId}/savings?category=hdcr`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch HDCR savings data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.data || !result.data.results) {
        throw new Error('Invalid response format from API');
      }
      
      console.log('HDCR savings data:', result.data.results);
      
      setHdcrData(result.data.results);
    } catch (error) {
      console.error('Error fetching HDCR savings data:', error);
      setHdcrError(error instanceof Error ? error.message : 'Failed to load HDCR savings data');
      
      toast({
        title: 'Error',
        description: 'Failed to load high dollar claim review data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setHdcrLoading(false);
    }
  };
  
  // Fetch Prior Auth savings data from the savings API endpoint
  const fetchPriorAuthSavingsData = async () => {
    setPriorAuthLoading(true);
    setPriorAuthError(null);
    
    try {
      // Use the savings endpoint with the priorauth category
      const response = await fetch(`/api/files/${fileId}/savings?category=priorauth`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch Prior Auth savings data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.data || !result.data.results) {
        throw new Error('Invalid response format from API');
      }
      
      console.log('Prior Auth savings data:', result.data.results);
      
      setPriorAuthData(result.data.results);
    } catch (error) {
      console.error('Error fetching Prior Auth savings data:', error);
      setPriorAuthError(error instanceof Error ? error.message : 'Failed to load Prior Auth savings data');
      
      toast({
        title: 'Error',
        description: 'Failed to load prior authorization data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setPriorAuthLoading(false);
    }
  };
  
  // Fetch Quantity Limits savings data from the savings API endpoint
  const fetchQtyLimitSavingsData = async () => {
    setQtyLimitLoading(true);
    setQtyLimitError(null);
    
    try {
      // Use the savings endpoint with the qtylim category
      const response = await fetch(`/api/files/${fileId}/savings?category=qtylim`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch Quantity Limits savings data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.data || !result.data.results) {
        throw new Error('Invalid response format from API');
      }
      
      console.log('Quantity Limits savings data:', result.data.results);
      
      setQtyLimitData(result.data.results);
    } catch (error) {
      console.error('Error fetching Quantity Limits savings data:', error);
      setQtyLimitError(error instanceof Error ? error.message : 'Failed to load Quantity Limits savings data');
      
      toast({
        title: 'Error',
        description: 'Failed to load quantity limits data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setQtyLimitLoading(false);
    }
  };

  // Render percentage of total plan cost - handle either property name format
  const renderPercentage = (cost: number) => {
    const totalCost = planData?.total_plan_cost || 0;
    if (!totalCost || totalCost === 0) return '0%';
    return `${((cost / totalCost) * 100).toFixed(2)}%`;
  };

  if (loading && !planData) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="300px">
        <VStack spacing={4}>
          <Spinner size="xl" />
          <Text>Loading exclusions data...</Text>
          <Text fontSize="sm" color="gray.500">
            This may take up to a minute to compile all exclusions
          </Text>
        </VStack>
      </Box>
    );
  }

  if (error && !planData) {
    return (
      <Alert status="error" variant="subtle" flexDirection="column" alignItems="center" justifyContent="center" textAlign="center" height="200px">
        <AlertIcon boxSize="40px" mr={0} />
        <Text mt={4} mb={1} fontSize="lg">Error Loading Data</Text>
        <Text>{error}</Text>
      </Alert>
    );
  }

  // Get category data
  const planExclusions = planData?.exclusion_categories || [];
  const drugFlags = planData?.optional_program_categories || [];
  
  // Calculate totals
  const planExclusionTotals = calculateTotals(planExclusions);
  const drugFlagTotals = calculateTotals(drugFlags);
  const grandTotals = calculateGrandTotals();
  
  // Create a formulary exclusions table
  const renderFormularyTable = () => {
    if (formularyLoading && !formularyData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Formulary Exclusions</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (formularyError && !formularyData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Formulary Exclusions</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load formulary exclusions data</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    if (!formularyData || !formularyData.results || formularyData.results.length === 0) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Formulary Exclusions</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No formulary exclusions data found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">Formulary Exclusions</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th>Category</Th>
                  <Th isNumeric>Incumbent Plan Cost</Th>
                  <Th isNumeric>Illuminate Plan Cost</Th>
                  <Th isNumeric>Savings</Th>
                  <Th isNumeric>Claim Count</Th>
                  <Th isNumeric>Member Count</Th>
                </Tr>
              </Thead>
              <Tbody>
                {formularyData.results.filter((item: any) => item.category !== 'Total').map((category: any) => (
                  <Tr key={category.category}>
                    <Td fontWeight="medium">{category.category}</Td>
                    <Td isNumeric>{category.incumbent_plan_cost}</Td>
                    <Td isNumeric>{category.illuminate_plan_cost}</Td>
                    <Td isNumeric color="green.600" fontWeight="medium">{category.savings}</Td>
                    <Td isNumeric>{category.claim_count || 0}</Td>
                    <Td isNumeric>{category.member_count || 0}</Td>
                  </Tr>
                ))}
                {/* Total row */}
                {formularyData.results.filter((item: any) => item.category === 'Total').map((total: any) => (
                  <Tr key="total" fontWeight="bold" bg="gray.50">
                    <Td>Total</Td>
                    <Td isNumeric>{total.incumbent_plan_cost}</Td>
                    <Td isNumeric>{total.illuminate_plan_cost}</Td>
                    <Td isNumeric color="green.600">{total.savings}</Td>
                    <Td isNumeric>{total.claim_count || 0}</Td>
                    <Td isNumeric>{total.member_count || 0}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    );
  };

  // Create table for a category type
  const renderCategoryTable = (
    title: string, 
    categories: ExclusionCategory[], 
    totals: { totalPlanCost: number; totalClaimCount: number; totalMemberCount: number }
  ) => {
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">{title}</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th>Category</Th>
                  <Th isNumeric>Plan Cost</Th>
                  <Th isNumeric>% of Total Plan Cost</Th>
                  <Th isNumeric>Claim Count</Th>
                  <Th isNumeric>Unique Members</Th>
                </Tr>
              </Thead>
              <Tbody>
                {categories.length > 0 ? (
                  <>
                    {categories.map((category) => (
                      <Tr key={category.category || category.exclusion_name}>
                        <Td fontWeight="medium">{category.category || category.exclusion_name}</Td>
                        <Td isNumeric>{formatCurrency(category.plan_cost_sum || category.total_plan_cost || 0)}</Td>
                        <Td isNumeric>{renderPercentage(category.plan_cost_sum || category.total_plan_cost || 0)}</Td>
                        <Td isNumeric>{category.claim_count}</Td>
                        <Td isNumeric>{category.unique_member_count || category.member_count || 0}</Td>
                      </Tr>
                    ))}
                    <Tr fontWeight="bold" bg="gray.50">
                      <Td>{title} Total</Td>
                      <Td isNumeric>{formatCurrency(totals.totalPlanCost)}</Td>
                      <Td isNumeric>{renderPercentage(totals.totalPlanCost)}</Td>
                      <Td isNumeric>{totals.totalClaimCount}</Td>
                      <Td isNumeric>{totals.totalMemberCount}</Td>
                    </Tr>
                  </>
                ) : (
                  <Tr>
                    <Td colSpan={5} textAlign="center" py={4}>
                      No {title.toLowerCase()} categories found.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    );
  };

  // Create weight loss savings table
  const renderWeightLossTable = () => {
    if (weightLossLoading && !weightLossData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">GLP-1 Weight Loss</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (weightLossError && !weightLossData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">GLP-1 Weight Loss</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load weight loss savings data</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    if (!weightLossData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">GLP-1 Weight Loss</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No weight loss savings data found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    // Extract the results data, handling different possible structures
    const resultData = weightLossData.results || weightLossData;
    
    // Check if there's savings data
    const hasSavings = resultData && resultData['Part 1 Potential Savings'] && 
                      parseFloat(resultData['Part 1 Potential Savings'].toString().replace(/[^0-9.-]+/g, '')) > 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">GLP-1 Weight Loss</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            {hasSavings ? (
              <Table variant="simple" size="sm">
                <Thead>
                  <Tr bg="gray.50">
                    <Th isNumeric>Brand Cost</Th>
                    <Th isNumeric>Generic Cost</Th>
                    <Th isNumeric>Claim Count</Th>
                    <Th isNumeric>Member Count</Th>
                    <Th isNumeric>Potential Savings</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  <Tr>
                    <Td isNumeric>{resultData['Brand Cost'] ? formatCurrency(resultData['Brand Cost']) : '$0.00'}</Td>
                    <Td isNumeric>{resultData['Generic Cost'] ? formatCurrency(resultData['Generic Cost']) : '$0.00'}</Td>
                    <Td isNumeric>{resultData['Claim Count'] || 0}</Td>
                    <Td isNumeric>{resultData['Member Count'] || 0}</Td>
                    <Td isNumeric color="green.600" fontWeight="bold">
                      {resultData['Part 1 Potential Savings'] ? formatCurrency(resultData['Part 1 Potential Savings']) : '$0.00'}
                    </Td>
                  </Tr>
                </Tbody>
              </Table>
            ) : (
              <Alert status="info" variant="subtle">
                <AlertIcon />
                <Text>No significant weight loss medication savings detected in this data.</Text>
              </Alert>
            )}
          </Box>
        </CardBody>
      </Card>
    );
  };
  
  // Create diabetes savings table
  const renderDiabetesTable = () => {
    if (diabetesLoading && !diabetesData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">GLP-1 Diabetes</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (diabetesError && !diabetesData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">GLP-1 Diabetes</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load diabetes savings data</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    if (!diabetesData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">GLP-1 Diabetes</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No diabetes savings data found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    // Extract the results data, handling different possible structures
    const resultData = diabetesData.results || diabetesData;
    
    // Check if there's savings data
    const hasSavings = resultData && resultData['Part 1 Potential Savings'] && 
                      parseFloat(resultData['Part 1 Potential Savings'].toString().replace(/[^0-9.-]+/g, '')) > 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">GLP-1 Diabetes</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            {hasSavings ? (
              <Table variant="simple" size="sm">
                <Thead>
                  <Tr bg="gray.50">
                    <Th isNumeric>Brand Cost</Th>
                    <Th isNumeric>Generic Cost</Th>
                    <Th isNumeric>Claim Count</Th>
                    <Th isNumeric>Member Count</Th>
                    <Th isNumeric>Potential Savings</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  <Tr>
                    <Td isNumeric>{resultData['Brand Cost'] ? formatCurrency(resultData['Brand Cost']) : '$0.00'}</Td>
                    <Td isNumeric>{resultData['Generic Cost'] ? formatCurrency(resultData['Generic Cost']) : '$0.00'}</Td>
                    <Td isNumeric>{resultData['Claim Count'] || 0}</Td>
                    <Td isNumeric>{resultData['Member Count'] || 0}</Td>
                    <Td isNumeric color="green.600" fontWeight="bold">
                      {resultData['Part 1 Potential Savings'] ? formatCurrency(resultData['Part 1 Potential Savings']) : '$0.00'}
                    </Td>
                  </Tr>
                </Tbody>
              </Table>
            ) : (
              <Alert status="info" variant="subtle">
                <AlertIcon />
                <Text>No significant diabetes medication savings detected in this data.</Text>
              </Alert>
            )}
          </Box>
        </CardBody>
      </Card>
    );
  };

  // Create HDCR savings table
  const renderHdcrTable = () => {
    if (hdcrLoading && !hdcrData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">High Dollar Claim Review</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (hdcrError && !hdcrData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">High Dollar Claim Review</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load high dollar claim review data</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    if (!hdcrData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">High Dollar Claim Review</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No high dollar claim review data found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    // Extract the results data, handling different possible structures
    const resultData = hdcrData.results || hdcrData;
    
    // Check if there's savings data
    const hasSavings = resultData && resultData['Part 1 Potential Savings'] && 
                      parseFloat(resultData['Part 1 Potential Savings'].toString().replace(/[^0-9.-]+/g, '')) > 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">High Dollar Claim Review</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            {hasSavings ? (
              <Table variant="simple" size="sm">
                <Thead>
                  <Tr bg="gray.50">
                    <Th isNumeric>Brand Cost</Th>
                    <Th isNumeric>Generic Cost</Th>
                    <Th isNumeric>Claim Count</Th>
                    <Th isNumeric>Member Count</Th>
                    <Th isNumeric>Potential Savings</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  <Tr>
                    <Td isNumeric>{resultData['Brand Cost'] ? formatCurrency(resultData['Brand Cost']) : '$0.00'}</Td>
                    <Td isNumeric>{resultData['Generic Cost'] ? formatCurrency(resultData['Generic Cost']) : '$0.00'}</Td>
                    <Td isNumeric>{resultData['Claim Count'] || 0}</Td>
                    <Td isNumeric>{resultData['Member Count'] || 0}</Td>
                    <Td isNumeric color="green.600" fontWeight="bold">
                      {resultData['Part 1 Potential Savings'] ? formatCurrency(resultData['Part 1 Potential Savings']) : '$0.00'}
                    </Td>
                  </Tr>
                </Tbody>
              </Table>
            ) : (
              <Alert status="info" variant="subtle">
                <AlertIcon />
                <Text>No significant high dollar claims detected in this data.</Text>
              </Alert>
            )}
          </Box>
        </CardBody>
      </Card>
    );
  };
  
  // Create Prior Auth savings table
  const renderPriorAuthTable = () => {
    if (priorAuthLoading && !priorAuthData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Prior Authorization</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (priorAuthError && !priorAuthData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Prior Authorization</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load prior authorization data</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    if (!priorAuthData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Prior Authorization</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No prior authorization data found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    // Extract the results data, handling different possible structures
    const resultData = priorAuthData.results || priorAuthData;
    
    // Check if there's savings data
    const hasSavings = resultData && resultData['Part 1 Potential Savings'] && 
                      parseFloat(resultData['Part 1 Potential Savings'].toString().replace(/[^0-9.-]+/g, '')) > 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">Prior Authorization</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            {hasSavings ? (
              <Table variant="simple" size="sm">
                <Thead>
                  <Tr bg="gray.50">
                    <Th isNumeric>Brand Cost</Th>
                    <Th isNumeric>Generic Cost</Th>
                    <Th isNumeric>Claim Count</Th>
                    <Th isNumeric>Member Count</Th>
                    <Th isNumeric>Potential Savings</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  <Tr>
                    <Td isNumeric>{resultData['Brand Cost'] ? formatCurrency(resultData['Brand Cost']) : '$0.00'}</Td>
                    <Td isNumeric>{resultData['Generic Cost'] ? formatCurrency(resultData['Generic Cost']) : '$0.00'}</Td>
                    <Td isNumeric>{resultData['Claim Count'] || 0}</Td>
                    <Td isNumeric>{resultData['Member Count'] || 0}</Td>
                    <Td isNumeric color="green.600" fontWeight="bold">
                      {resultData['Part 1 Potential Savings'] ? formatCurrency(resultData['Part 1 Potential Savings']) : '$0.00'}
                    </Td>
                  </Tr>
                </Tbody>
              </Table>
            ) : (
              <Alert status="info" variant="subtle">
                <AlertIcon />
                <Text>No significant prior authorization savings detected in this data.</Text>
              </Alert>
            )}
          </Box>
        </CardBody>
      </Card>
    );
  };
  
  // Create Quantity Limits savings table
  const renderQtyLimitTable = () => {
    if (qtyLimitLoading && !qtyLimitData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Quantity Limits</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (qtyLimitError && !qtyLimitData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Quantity Limits</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load quantity limits data</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    if (!qtyLimitData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Quantity Limits</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No quantity limits data found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    // Extract the results data, handling different possible structures
    const resultData = qtyLimitData.results || qtyLimitData;
    
    // Check if there's savings data
    const hasSavings = resultData && resultData['Part 1 Potential Savings'] && 
                      parseFloat(resultData['Part 1 Potential Savings'].toString().replace(/[^0-9.-]+/g, '')) > 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">Quantity Limits</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            {hasSavings ? (
              <Table variant="simple" size="sm">
                <Thead>
                  <Tr bg="gray.50">
                    <Th isNumeric>Brand Cost</Th>
                    <Th isNumeric>Generic Cost</Th>
                    <Th isNumeric>Claim Count</Th>
                    <Th isNumeric>Member Count</Th>
                    <Th isNumeric>Potential Savings</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  <Tr>
                    <Td isNumeric>{resultData['Brand Cost'] ? formatCurrency(resultData['Brand Cost']) : '$0.00'}</Td>
                    <Td isNumeric>{resultData['Generic Cost'] ? formatCurrency(resultData['Generic Cost']) : '$0.00'}</Td>
                    <Td isNumeric>{resultData['Claim Count'] || 0}</Td>
                    <Td isNumeric>{resultData['Member Count'] || 0}</Td>
                    <Td isNumeric color="green.600" fontWeight="bold">
                      {resultData['Part 1 Potential Savings'] ? formatCurrency(resultData['Part 1 Potential Savings']) : '$0.00'}
                    </Td>
                  </Tr>
                </Tbody>
              </Table>
            ) : (
              <Alert status="info" variant="subtle">
                <AlertIcon />
                <Text>No significant quantity limits savings detected in this data.</Text>
              </Alert>
            )}
          </Box>
        </CardBody>
      </Card>
    );
  };

  return (
    <VStack spacing={6} align="stretch">
      {/* Summary header */}
      <HStack justify="space-between" px={2}>
        <Heading size="md">Savings Analysis</Heading>
        <Text fontWeight="bold">
          Total Plan Cost: {formatCurrency(planData?.total_plan_cost || 0)}
        </Text>
      </HStack>
      
      {/* Tabs */}
      <HStack spacing={4} borderBottom="1px" borderColor="gray.200">
        <Button 
          variant={activeTab === 'clinical' ? 'solid' : 'ghost'} 
          colorScheme={activeTab === 'clinical' ? 'blue' : 'gray'}
          borderBottom={activeTab === 'clinical' ? '2px solid' : 'none'}
          borderRadius="0"
          onClick={() => setActiveTab('clinical')}
        >
          Clinical Savings
        </Button>
        <Button 
          variant={activeTab === 'contract' ? 'solid' : 'ghost'} 
          colorScheme={activeTab === 'contract' ? 'blue' : 'gray'}
          borderBottom={activeTab === 'contract' ? '2px solid' : 'none'}
          borderRadius="0"
          onClick={() => setActiveTab('contract')}
        >
          Contract Savings
        </Button>
        <Button 
          variant={activeTab === 'additional' ? 'solid' : 'ghost'} 
          colorScheme={activeTab === 'additional' ? 'blue' : 'gray'}
          borderBottom={activeTab === 'additional' ? '2px solid' : 'none'}
          borderRadius="0"
          onClick={() => setActiveTab('additional')}
        >
          Additional Savings
        </Button>
      </HStack>
      
      {/* Clinical Savings Tab Content */}
      {activeTab === 'clinical' && (
        <>
          {/* Plan Exclusions Table */}
          {renderCategoryTable("Plan Exclusions", planExclusions, planExclusionTotals)}
          
          {/* Formulary Exclusions Table */}
          {renderFormularyTable()}
          
          {/* Weight Loss Savings Table */}
          {renderWeightLossTable()}
          
          {/* Diabetes Savings Table */}
          {renderDiabetesTable()}
          
          {/* High Dollar Claim Review Table */}
          {renderHdcrTable()}
          
          {/* Prior Authorization Table */}
          {renderPriorAuthTable()}
          
          {/* Quantity Limits Table */}
          {renderQtyLimitTable()}
        </>
      )}
      
      {/* Contract Savings Tab Content */}
      {activeTab === 'contract' && (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Contract Savings Analysis</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">Contract savings analysis will be available in a future update.</Text>
          </CardBody>
        </Card>
      )}
      
      {/* Additional Savings Tab Content */}
      {activeTab === 'additional' && (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Additional Savings Analysis</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">Additional savings analysis will be available in a future update.</Text>
          </CardBody>
        </Card>
      )}
    </VStack>
  );
}