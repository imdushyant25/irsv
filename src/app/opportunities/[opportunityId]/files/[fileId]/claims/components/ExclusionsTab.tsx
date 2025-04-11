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

// Type for exclusion category data
interface ExclusionCategory {
  category: string;
  plan_cost_sum: number;
  claim_count: number;
  unique_member_count: number;
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

export default function ExclusionsTab({ fileId }: ExclusionsTabProps) {
  const [data, setData] = useState<ExclusionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const toast = useToast();

  // Fetch initial data
  useEffect(() => {
    fetchExclusionsData();
  }, [fileId]);

  // Calculate totals for a category group
  const calculateTotals = useCallback((categories: ExclusionCategory[]) => {
    return categories.reduce(
      (acc, category) => ({
        totalPlanCost: acc.totalPlanCost + (category.plan_cost_sum || 0),
        totalClaimCount: acc.totalClaimCount + (category.claim_count || 0),
        totalMemberCount: acc.totalMemberCount + Math.max(0, category.unique_member_count || 0),
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

  // Fetch exclusions data from API
  const fetchExclusionsData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use GET for data load
      const response = await fetch(`/api/files/${fileId}/exclusions`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch exclusions data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.data) {
        throw new Error('Invalid response format from API');
      }
      
      setData(result.data);
    } catch (error) {
      console.error('Error fetching exclusions data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load exclusions data');
      
      toast({
        title: 'Error',
        description: 'Failed to load exclusions data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Render percentage of total plan cost
  const renderPercentage = (cost: number) => {
    if (!data?.total_plan_cost || data.total_plan_cost === 0) return '0%';
    return `${((cost / data.total_plan_cost) * 100).toFixed(2)}%`;
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
                      <Tr key={category.category}>
                        <Td fontWeight="medium">{category.category}</Td>
                        <Td isNumeric>{formatCurrency(category.plan_cost_sum)}</Td>
                        <Td isNumeric>{renderPercentage(category.plan_cost_sum)}</Td>
                        <Td isNumeric>{category.claim_count}</Td>
                        <Td isNumeric>{category.unique_member_count}</Td>
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
        <Heading size="md">Exclusions Analysis</Heading>
        <Text fontWeight="bold">
          Total Plan Cost: {formatCurrency(data?.total_plan_cost || 0)}
        </Text>
      </HStack>
      
      {/* Plan Exclusions Table */}
      {renderCategoryTable("Plan Exclusions", planExclusions, planExclusionTotals)}
      
      {/* Drug Flags Table */}
      {renderCategoryTable("Drug Flags", drugFlags, drugFlagTotals)}
      
      {/* Grand Total Summary */}
      <Card variant="outline">
        <CardBody px={6} py={4} bg="blue.50">
          <HStack justify="space-between">
            <Heading size="md">Grand Total (All Exclusions)</Heading>
            <HStack spacing={6}>
              <VStack align="flex-end" spacing={0}>
                <Text fontSize="sm" color="gray.600">Plan Cost</Text>
                <Text fontWeight="bold">{formatCurrency(grandTotals.totalPlanCost)}</Text>
              </VStack>
              <VStack align="flex-end" spacing={0}>
                <Text fontSize="sm" color="gray.600">% of Total Plan Cost</Text>
                <Text fontWeight="bold">{renderPercentage(grandTotals.totalPlanCost)}</Text>
              </VStack>
              <VStack align="flex-end" spacing={0}>
                <Text fontSize="sm" color="gray.600">Claims</Text>
                <Text fontWeight="bold">{grandTotals.totalClaimCount}</Text>
              </VStack>
              <VStack align="flex-end" spacing={0}>
                <Text fontSize="sm" color="gray.600">Members</Text>
                <Text fontWeight="bold">{grandTotals.totalMemberCount}</Text>
              </VStack>
            </HStack>
          </HStack>
        </CardBody>
      </Card>
    </VStack>
  );
}