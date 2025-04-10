// File: src/app/opportunities/[opportunityId]/files/[fileId]/claims/components/ExclusionsTab.tsx
'use client';

import React, { useState, useEffect } from 'react';
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

// Type for API response
interface ExclusionsResponse {
  exclusion_categories: ExclusionCategory[];
  optional_program_categories: ExclusionCategory[];
  total_plan_cost: number;
  other_awp_sum: number | null;
}

interface ExclusionsTabProps {
  fileId: string;
}

export default function ExclusionsTab({ fileId }: ExclusionsTabProps) {
  const [data, setData] = useState<ExclusionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<{ [key: string]: boolean }>({});
  const [filteredData, setFilteredData] = useState<ExclusionCategory[]>([]);
  const [categoryTotals, setCategoryTotals] = useState<{
    totalPlanCost: number;
    totalClaimCount: number;
    totalMemberCount: number;
  }>({
    totalPlanCost: 0,
    totalClaimCount: 0,
    totalMemberCount: 0
  });
  
  const toast = useToast();

  // Fetch initial data
  useEffect(() => {
    fetchExclusionsData();
  }, [fileId]);

  // Update filtered data and totals when selection changes
  useEffect(() => {
    if (data?.exclusion_categories) {
      const filtered = data.exclusion_categories.filter(
        category => selectedCategories[category.category]
      );
      
      setFilteredData(filtered);
      
      // Calculate totals for selected categories
      const totals = filtered.reduce(
        (acc, category) => ({
          totalPlanCost: acc.totalPlanCost + (category.plan_cost_sum || 0),
          totalClaimCount: acc.totalClaimCount + (category.claim_count || 0),
          totalMemberCount: acc.totalMemberCount + Math.max(0, category.unique_member_count || 0),
        }),
        { totalPlanCost: 0, totalClaimCount: 0, totalMemberCount: 0 }
      );
      
      setCategoryTotals(totals);
    }
  }, [selectedCategories, data]);

  // Initialize category selections when data is loaded
  useEffect(() => {
    if (data?.exclusion_categories) {
      // Initially select all categories with non-zero values
      const initialSelections = data.exclusion_categories.reduce((acc, category) => {
        // Select categories with non-zero values by default
        const hasData = category.plan_cost_sum > 0 || 
                        category.claim_count > 0 || 
                        category.unique_member_count > 0;
        
        acc[category.category] = hasData;
        return acc;
      }, {} as { [key: string]: boolean });
      
      setSelectedCategories(initialSelections);
    }
  }, [data]);

  // Fetch exclusions data from API
  const fetchExclusionsData = async (categories?: string[]) => {
    setLoading(true);
    setError(null);
    
    try {
      // Determine if we should use GET or POST based on whether we have category filters
      let response;
      
      if (categories && categories.length > 0) {
        // Use POST for filtering by categories
        response = await fetch(`/api/files/${fileId}/exclusions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ categories })
        });
      } else {
        // Use GET for initial data load
        response = await fetch(`/api/files/${fileId}/exclusions`);
      }
      
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

  // Handle category toggle
  const handleCategoryToggle = (category: string, isChecked: boolean) => {
    setSelectedCategories(prev => ({
      ...prev,
      [category]: isChecked
    }));
  };

  // Toggle all categories
  const handleToggleAll = (isChecked: boolean) => {
    if (data?.exclusion_categories) {
      const newSelections = data.exclusion_categories.reduce((acc, category) => {
        acc[category.category] = isChecked;
        return acc;
      }, {} as { [key: string]: boolean });
      
      setSelectedCategories(newSelections);
    }
  };

  // Calculate if all categories are selected
  const allSelected = data?.exclusion_categories?.every(
    category => selectedCategories[category.category]
  ) || false;

  // Handle refresh click
  const handleRefresh = () => {
    const selectedCategoryNames = Object.entries(selectedCategories)
      .filter(([_, isSelected]) => isSelected)
      .map(([category]) => category);
    
    fetchExclusionsData(selectedCategoryNames);
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

  return (
    <VStack spacing={6} align="stretch">
      <Card variant="outline">
        <CardHeader px={6} py={4}>
          <HStack justify="space-between">
            <Heading size="md">Exclusion Categories</Heading>
            <HStack>
              <Button
                leftIcon={<RefreshCw size={16} />}
                colorScheme="blue"
                size="sm"
                onClick={handleRefresh}
                isLoading={loading}
              >
                Apply Filters
              </Button>
            </HStack>
          </HStack>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Divider mb={4} />
          
          {/* Selection controls */}
          <HStack mb={4} justify="space-between">
            <FormControl display="flex" alignItems="center" width="auto">
              <Switch
                id="toggle-all"
                isChecked={allSelected}
                onChange={(e) => handleToggleAll(e.target.checked)}
              />
              <FormLabel htmlFor="toggle-all" mb="0" ml="2" cursor="pointer">
                Toggle All Categories
              </FormLabel>
            </FormControl>
            
            <Text fontSize="sm" color="gray.600">
              Total Plan Cost: {formatCurrency(data?.total_plan_cost || 0)}
            </Text>
          </HStack>
          
          {/* Category toggles */}
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} mb={6}>
            {data?.exclusion_categories?.map((category) => (
              <FormControl 
                key={category.category} 
                display="flex" 
                alignItems="center"
                bg={category.plan_cost_sum > 0 || category.claim_count > 0 ? "blue.50" : "transparent"}
                p={2}
                borderRadius="md"
              >
                <Switch
                  id={`category-${category.category}`}
                  isChecked={selectedCategories[category.category] || false}
                  onChange={(e) => handleCategoryToggle(category.category, e.target.checked)}
                />
                <FormLabel htmlFor={`category-${category.category}`} mb="0" ml="2" cursor="pointer" fontSize="sm">
                  <HStack>
                    <Text>{category.category}</Text>
                    {(category.plan_cost_sum > 0 || category.claim_count > 0) && (
                      <Badge colorScheme="blue" variant="solid">
                        {category.claim_count}
                      </Badge>
                    )}
                  </HStack>
                </FormLabel>
              </FormControl>
            ))}
          </SimpleGrid>
          
          {/* Results table */}
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th>Category</Th>
                  <Th isNumeric>Plan Cost</Th>
                  <Th isNumeric>% of Total</Th>
                  <Th isNumeric>Claim Count</Th>
                  <Th isNumeric>Unique Members</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredData.map((category) => (
                  <Tr key={category.category}>
                    <Td fontWeight="medium">{category.category}</Td>
                    <Td isNumeric>{formatCurrency(category.plan_cost_sum)}</Td>
                    <Td isNumeric>{renderPercentage(category.plan_cost_sum)}</Td>
                    <Td isNumeric>{category.claim_count}</Td>
                    <Td isNumeric>{category.unique_member_count}</Td>
                  </Tr>
                ))}
                
                {/* Totals row */}
                {filteredData.length > 0 && (
                  <Tr fontWeight="bold" bg="gray.50">
                    <Td>Grand Total</Td>
                    <Td isNumeric>{formatCurrency(categoryTotals.totalPlanCost)}</Td>
                    <Td isNumeric>{renderPercentage(categoryTotals.totalPlanCost)}</Td>
                    <Td isNumeric>{categoryTotals.totalClaimCount}</Td>
                    <Td isNumeric>{categoryTotals.totalMemberCount}</Td>
                  </Tr>
                )}
                
                {filteredData.length === 0 && (
                  <Tr>
                    <Td colSpan={5} textAlign="center" py={4}>
                      No categories selected. Please select at least one category to view results.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    </VStack>
  );
}