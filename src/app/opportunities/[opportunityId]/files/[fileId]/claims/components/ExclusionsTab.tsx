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
  const [data, setData] = useState<ExclusionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const toast = useToast();

  // Fetch initial data
  useEffect(() => {
    fetchExclusionsData();
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
    if (!data) return { totalPlanCost: 0, totalClaimCount: 0, totalMemberCount: 0 };
    
    const planExclusionCategories = data.exclusion_categories || [];
    const drugFlagCategories = data.optional_program_categories || [];
    
    const allCategories = [...planExclusionCategories, ...drugFlagCategories];
    
    return calculateTotals(allCategories);
  }, [data, calculateTotals]);

  // Fetch exclusions data from the new savings API endpoint
  const fetchExclusionsData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use the new savings endpoint with plans category (matching what exclusionsProcessor saves)
      const response = await fetch(`/api/files/${fileId}/savings?category=plans`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch savings data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.data || !result.data.results) {
        throw new Error('Invalid response format from API');
      }
      
      // Extract the nested results data in the correct format for the component
      const resultsData = result.data.results.results;
      
      // Transform the data into the format expected by the component
      const transformedData = {
        exclusion_categories: resultsData.filter(item => 
          item.exclusion_type === 'Plan' && 
          item.exclusion_name !== 'TOTAL' && 
          item.sort_order === 1
        ),
        optional_program_categories: [], // Empty since we removed Drug Flags
        total_plan_cost: resultsData.find(item => 
          item.exclusion_type === 'OVERALL TOTAL' || 
          (item.exclusion_type === 'Plan' && item.exclusion_name === 'TOTAL')
        )?.total_plan_cost || 0
      };
      
      // Log the transformed data for debugging
      console.log('Transformed data for component:', transformedData);
      
      setData(transformedData);
    } catch (error) {
      console.error('Error fetching clinical savings data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load clinical savings data');
      
      toast({
        title: 'Error',
        description: 'Failed to load clinical savings data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Render percentage of total plan cost - handle either property name format
  const renderPercentage = (cost: number) => {
    const totalCost = data?.total_plan_cost || 0;
    if (!totalCost || totalCost === 0) return '0%';
    return `${((cost / totalCost) * 100).toFixed(2)}%`;
  };

  if (loading && !data) {
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

  if (error && !data) {
    return (
      <Alert status="error" variant="subtle" flexDirection="column" alignItems="center" justifyContent="center" textAlign="center" height="200px">
        <AlertIcon boxSize="40px" mr={0} />
        <Text mt={4} mb={1} fontSize="lg">Error Loading Data</Text>
        <Text>{error}</Text>
      </Alert>
    );
  }

  // Get category data
  const planExclusions = data?.exclusion_categories || [];
  const drugFlags = data?.optional_program_categories || [];
  
  // Calculate totals
  const planExclusionTotals = calculateTotals(planExclusions);
  const drugFlagTotals = calculateTotals(drugFlags);
  const grandTotals = calculateGrandTotals();

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

  return (
    <VStack spacing={6} align="stretch">
      {/* Summary header */}
      <HStack justify="space-between" px={2}>
        <Heading size="md">Clinical Savings Analysis</Heading>
        <Text fontWeight="bold">
          Total Plan Cost: {formatCurrency(data?.total_plan_cost || 0)}
        </Text>
      </HStack>
      
      {/* Plan Exclusions Table */}
      {renderCategoryTable("Plan Exclusions", planExclusions, planExclusionTotals)}
    </VStack>
  );
}