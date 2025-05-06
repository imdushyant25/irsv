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
  const [contractSavingsData, setContractSavingsData] = useState<any>(null);
  const [hddhpData, setHddhpData] = useState<any>(null);
  const [acaData, setAcaData] = useState<any>(null);
  const [rebateData, setRebateData] = useState<any>(null);
  const [rdsData, setRdsData] = useState<any>(null);
  const [papData, setPapData] = useState<any>(null);
  const [hansData, setHansData] = useState<any>(null);
  const [maData, setMaData] = useState<any>(null);
  const [cciData, setCciData] = useState<any>(null);
  const [mcapData, setMcapData] = useState<any>(null);
  const [idsData, setIdsData] = useState<any>(null);
  const [sppData, setSppData] = useState<any>(null);
  const [dawData, setDawData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [formularyLoading, setFormularyLoading] = useState(true);
  const [weightLossLoading, setWeightLossLoading] = useState(true);
  const [diabetesLoading, setDiabetesLoading] = useState(true);
  const [hdcrLoading, setHdcrLoading] = useState(true);
  const [priorAuthLoading, setPriorAuthLoading] = useState(true);
  const [qtyLimitLoading, setQtyLimitLoading] = useState(true);
  const [contractSavingsLoading, setContractSavingsLoading] = useState(true);
  const [hddhpLoading, setHddhpLoading] = useState(true);
  const [acaLoading, setAcaLoading] = useState(true);
  const [rebateLoading, setRebateLoading] = useState(true);
  const [rdsLoading, setRdsLoading] = useState(true);
  const [papLoading, setPapLoading] = useState(true);
  const [hansLoading, setHansLoading] = useState(true);
  const [maLoading, setMaLoading] = useState(true);
  const [cciLoading, setCciLoading] = useState(true);
  const [mcapLoading, setMcapLoading] = useState(true);
  const [idsLoading, setIdsLoading] = useState(true);
  const [sppLoading, setSppLoading] = useState(true);
  const [dawLoading, setDawLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formularyError, setFormularyError] = useState<string | null>(null);
  const [weightLossError, setWeightLossError] = useState<string | null>(null);
  const [diabetesError, setDiabetesError] = useState<string | null>(null);
  const [hdcrError, setHdcrError] = useState<string | null>(null);
  const [priorAuthError, setPriorAuthError] = useState<string | null>(null);
  const [qtyLimitError, setQtyLimitError] = useState<string | null>(null);
  const [contractSavingsError, setContractSavingsError] = useState<string | null>(null);
  const [hddhpError, setHddhpError] = useState<string | null>(null);
  const [acaError, setAcaError] = useState<string | null>(null);
  const [rebateError, setRebateError] = useState<string | null>(null);
  const [rdsError, setRdsError] = useState<string | null>(null);
  const [papError, setPapError] = useState<string | null>(null);
  const [hansError, setHansError] = useState<string | null>(null);
  const [maError, setMaError] = useState<string | null>(null);
  const [cciError, setCciError] = useState<string | null>(null);
  const [mcapError, setMcapError] = useState<string | null>(null);
  const [idsError, setIdsError] = useState<string | null>(null);
  const [sppError, setSppError] = useState<string | null>(null);
  const [dawError, setDawError] = useState<string | null>(null);
  
  const toast = useToast();
  
  // Fetch Contract Savings data from the savings API endpoint
  const fetchContractSavingsData = async () => {
    setContractSavingsLoading(true);
    setContractSavingsError(null);
    
    try {
      // Use the savings endpoint with the contractSavings category
      const response = await fetch(`/api/files/${fileId}/savings?category=contractSavings`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch contract savings data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.data || !result.data.results) {
        throw new Error('Invalid response format from API');
      }
      
      console.log('Contract Savings data:', result.data.results);
      
      setContractSavingsData(result.data.results);
    } catch (error) {
      console.error('Error fetching contract savings data:', error);
      setContractSavingsError(error instanceof Error ? error.message : 'Failed to load contract savings data');
      
      toast({
        title: 'Error',
        description: 'Failed to load contract savings data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setContractSavingsLoading(false);
    }
  };

  // Fetch HDHP preventive data
  const fetchHDHPData = async () => {
    setHddhpLoading(true);
    setHddhpError(null);
    
    try {
      // Use the savings endpoint with the fcHDHP category
      const response = await fetch(`/api/files/${fileId}/savings?category=fcHDHP`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch HDHP preventive data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.data || !result.data.results) {
        throw new Error('Invalid response format from API');
      }
      
      console.log('HDHP preventive data:', result.data.results);
      
      setHddhpData(result.data.results);
    } catch (error) {
      console.error('Error fetching HDHP preventive data:', error);
      setHddhpError(error instanceof Error ? error.message : 'Failed to load HDHP preventive data');
      
      toast({
        title: 'Error',
        description: 'Failed to load HDHP preventive data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setHddhpLoading(false);
    }
  };
  
  // Fetch ACA preventive data
  const fetchACAData = async () => {
    setAcaLoading(true);
    setAcaError(null);
    
    try {
      // Use the savings endpoint with the fcACA category
      const response = await fetch(`/api/files/${fileId}/savings?category=fcACA`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ACA preventive data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.data || !result.data.results) {
        throw new Error('Invalid response format from API');
      }
      
      console.log('ACA preventive data:', result.data.results);
      
      setAcaData(result.data.results);
    } catch (error) {
      console.error('Error fetching ACA preventive data:', error);
      setAcaError(error instanceof Error ? error.message : 'Failed to load ACA preventive data');
      
      toast({
        title: 'Error',
        description: 'Failed to load ACA preventive data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setAcaLoading(false);
    }
  };

  // Fetch rebate data
  const fetchRebateData = async () => {
    setRebateLoading(true);
    setRebateError(null);
    
    try {
      // Use the savings endpoint with the fcRebate category
      const response = await fetch(`/api/files/${fileId}/savings?category=fcRebate`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch rebate data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.data) {
        throw new Error('Invalid response format from API');
      }
      
      console.log('Rebate data:', result.data);
      
      // Store the data exactly as returned from the API
      // The render function will extract the needed fields
      setRebateData(result.data);
    } catch (error) {
      console.error('Error fetching rebate data:', error);
      setRebateError(error instanceof Error ? error.message : 'Failed to load rebate data');
      
      toast({
        title: 'Error',
        description: 'Failed to load rebate data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setRebateLoading(false);
    }
  };

  // Fetch RDS data
  const fetchRDSData = async () => {
    setRdsLoading(true);
    setRdsError(null);
    
    try {
      // Use the savings endpoint with the fcRDS category
      const response = await fetch(`/api/files/${fileId}/savings?category=fcRDS`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch RDS data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // The API might return null data with a success message
      // This is normal if the analysis hasn't been run yet, so we don't throw an error
      console.log('RDS data response:', result);
      
      // Store the data exactly as returned from the API (even if null)
      setRdsData(result.data);
    } catch (error) {
      console.error('Error fetching RDS data:', error);
      setRdsError(error instanceof Error ? error.message : 'Failed to load RDS data');
      
      toast({
        title: 'Error',
        description: 'Failed to load Retiree Drug Subsidy data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setRdsLoading(false);
    }
  };

  // Fetch PAP data
  const fetchPAPData = async () => {
    setPapLoading(true);
    setPapError(null);
    
    try {
      // Use the savings endpoint with the fcPAP category
      const response = await fetch(`/api/files/${fileId}/savings?category=fcPAP`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PAP data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // The API might return null data with a success message
      // This is normal if the analysis hasn't been run yet, so we don't throw an error
      console.log('PAP data response:', result);
      
      // Store the data exactly as returned from the API (even if null)
      setPapData(result.data);
    } catch (error) {
      console.error('Error fetching PAP data:', error);
      setPapError(error instanceof Error ? error.message : 'Failed to load PAP data');
      
      toast({
        title: 'Error',
        description: 'Failed to load Patient Assistance Program data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setPapLoading(false);
    }
  };

  // Fetch HANS data
  const fetchHANSData = async () => {
    setHansLoading(true);
    setHansError(null);
    
    try {
      // Use the savings endpoint with the fcHANS category
      const response = await fetch(`/api/files/${fileId}/savings?category=fcHANS`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch HANS data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // The API might return null data with a success message
      // This is normal if the analysis hasn't been run yet, so we don't throw an error
      console.log('HANS data response:', result);
      
      // Store the data exactly as returned from the API (even if null)
      setHansData(result.data);
    } catch (error) {
      console.error('Error fetching HANS data:', error);
      setHansError(error instanceof Error ? error.message : 'Failed to load HANS data');
      
      toast({
        title: 'Error',
        description: 'Failed to load Hospital at Home Network Solutions data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setHansLoading(false);
    }
  };

  // Fetch Maintenance & Acute data
  const fetchMaintenanceAcuteData = async () => {
    setMaLoading(true);
    setMaError(null);
    
    try {
      // Use the savings endpoint with the fcMA category
      const response = await fetch(`/api/files/${fileId}/savings?category=fcMA`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch Maintenance & Acute data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // The API might return null data with a success message
      // This is normal if the analysis hasn't been run yet, so we don't throw an error
      console.log('Maintenance & Acute data response:', result);
      
      // Store the data exactly as returned from the API (even if null)
      setMaData(result.data);
    } catch (error) {
      console.error('Error fetching Maintenance & Acute data:', error);
      setMaError(error instanceof Error ? error.message : 'Failed to load Maintenance & Acute data');
      
      toast({
        title: 'Error',
        description: 'Failed to load Maintenance & Acute data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setMaLoading(false);
    }
  };

  // Fetch Weight Based data
  const fetchWeightBasedData = async () => {
    setCciLoading(true);
    setCciError(null);
    
    try {
      // Use the savings endpoint with the fcCCI category
      const response = await fetch(`/api/files/${fileId}/savings?category=fcCCI`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch Weight Based data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // The API might return null data with a success message
      // This is normal if the analysis hasn't been run yet, so we don't throw an error
      console.log('Weight Based data response:', result);
      
      // Store the data exactly as returned from the API (even if null)
      setCciData(result.data);
    } catch (error) {
      console.error('Error fetching Weight Based data:', error);
      setCciError(error instanceof Error ? error.message : 'Failed to load Weight Based data');
      
      toast({
        title: 'Error',
        description: 'Failed to load Weight Based data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setCciLoading(false);
    }
  };

  // Fetch MCAP data
  const fetchMcapData = async () => {
    setMcapLoading(true);
    setMcapError(null);
    
    try {
      // Use the savings endpoint with the fcMCAP category
      const response = await fetch(`/api/files/${fileId}/savings?category=fcMCAP`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch MCAP data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Print comprehensive debug information
      console.log('MCAP data response:', result);
      console.log('MCAP data structure:', JSON.stringify(result, null, 2));
      
      if (result.data) {
        console.log('MCAP result.data:', JSON.stringify(result.data, null, 2));
      }
      
      // Handle different API response structures
      if (result.data && result.data.results) {
        // If data is nested in results property
        setMcapData(result.data.results);
      } else if (result.data) {
        // If data is directly in the data property
        setMcapData(result.data);
      } else {
        // Fallback
        setMcapData(result);
      }
    } catch (error) {
      console.error('Error fetching MCAP data:', error);
      setMcapError(error instanceof Error ? error.message : 'Failed to load MCAP data');
      
      toast({
        title: 'Error',
        description: 'Failed to load MCAP data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setMcapLoading(false);
    }
  };
  
  // Fetch SPP Parity Pricing data
  const fetchSppData = async () => {
    setSppLoading(true);
    setSppError(null);
    
    try {
      // Use the savings endpoint with the fcSPP category
      const response = await fetch(`/api/files/${fileId}/savings?category=fcSPP`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch Parity Pricing data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Print comprehensive debug information
      console.log('Parity Pricing data response:', result);
      console.log('Parity Pricing data structure:', JSON.stringify(result, null, 2));
      
      if (result.data) {
        console.log('Parity Pricing result.data:', JSON.stringify(result.data, null, 2));
      }
      
      // Handle different API response structures
      if (result.data && result.data.results) {
        // If data is nested in results property
        setSppData(result.data.results);
      } else if (result.data) {
        // If data is directly in the data property
        setSppData(result.data);
      } else {
        // Fallback
        setSppData(result);
      }
    } catch (error) {
      console.error('Error fetching Parity Pricing data:', error);
      setSppError(error instanceof Error ? error.message : 'Failed to load Parity Pricing data');
      
      toast({
        title: 'Error',
        description: 'Failed to load Parity Pricing data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setSppLoading(false);
    }
  };
  
  // Fetch DAW Penalties data
  const fetchDawData = async () => {
    setDawLoading(true);
    setDawError(null);
    
    try {
      // Use the savings endpoint with the fcDAW category
      const response = await fetch(`/api/files/${fileId}/savings?category=fcDAW`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch DAW Penalties data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Print comprehensive debug information
      console.log('DAW Penalties data response:', result);
      console.log('DAW Penalties data structure:', JSON.stringify(result, null, 2));
      
      if (result.data) {
        console.log('DAW Penalties result.data:', JSON.stringify(result.data, null, 2));
      }
      
      // Handle different API response structures
      if (result.data && result.data.results) {
        // If data is nested in results property
        setDawData(result.data.results);
      } else if (result.data) {
        // If data is directly in the data property
        setDawData(result.data);
      } else {
        // Fallback
        setDawData(result);
      }
    } catch (error) {
      console.error('Error fetching DAW Penalties data:', error);
      setDawError(error instanceof Error ? error.message : 'Failed to load DAW Penalties data');
      
      toast({
        title: 'Error',
        description: 'Failed to load DAW Penalties data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setDawLoading(false);
    }
  };

  // Fetch IDS data
  const fetchIdsData = async () => {
    setIdsLoading(true);
    setIdsError(null);
    
    try {
      // Use the savings endpoint with the fcIDS category
      const response = await fetch(`/api/files/${fileId}/savings?category=fcIDS`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch IDS data: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Print comprehensive debug information
      console.log('IDS data response:', result);
      console.log('IDS data structure:', JSON.stringify(result, null, 2));
      
      if (result.data) {
        console.log('IDS result.data:', JSON.stringify(result.data, null, 2));
      }
      
      // Handle different API response structures
      if (result.data && result.data.results) {
        // If data is nested in results property
        setIdsData(result.data.results);
      } else if (result.data) {
        // If data is directly in the data property
        setIdsData(result.data);
      } else {
        // Fallback
        setIdsData(result);
      }
    } catch (error) {
      console.error('Error fetching IDS data:', error);
      setIdsError(error instanceof Error ? error.message : 'Failed to load IDS data');
      
      toast({
        title: 'Error',
        description: 'Failed to load IDS data',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIdsLoading(false);
    }
  };

  // Fetch initial data
  useEffect(() => {
    fetchPlanExclusionsData();
    fetchFormularyExclusionsData();
    fetchWeightLossSavingsData();
    fetchDiabetesSavingsData();
    fetchHdcrSavingsData();
    fetchPriorAuthSavingsData();
    fetchQtyLimitSavingsData();
    fetchContractSavingsData();
    fetchHDHPData();
    fetchACAData();
    fetchRebateData();
    fetchRDSData();
    fetchPAPData();
    fetchHANSData();
    fetchMaintenanceAcuteData();
    fetchWeightBasedData();
    fetchMcapData();
    fetchIdsData();
    fetchSppData();
    fetchDawData();
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
  
  // Create HDHP Preventive table
  const renderHDHPTable = () => {
    if (hddhpLoading && !hddhpData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">HDHP Preventive</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (hddhpError && !hddhpData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">HDHP Preventive</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load HDHP preventive data</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    if (!hddhpData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">HDHP Preventive</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No HDHP preventive data found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">HDHP Preventive</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th>Category</Th>
                  <Th isNumeric>Total Cost</Th>
                  <Th isNumeric>Impacted Members</Th>
                  <Th isNumeric>Claim Count</Th>
                </Tr>
              </Thead>
              <Tbody>
                {hddhpData.filter((item: any) => item.category !== 'Total Impacted Members').map((category: any, index: number) => (
                  <Tr key={index}>
                    <Td fontWeight="medium">{category.category}</Td>
                    <Td isNumeric>{formatCurrency(category.total_cost || 0)}</Td>
                    <Td isNumeric>{category.impacted_members}</Td>
                    <Td isNumeric>{category.claim_count || 0}</Td>
                  </Tr>
                ))}
                {hddhpData.filter((item: any) => item.category === 'Total Impacted Members').map((total: any, index: number) => (
                  <Tr key={`total-${index}`} fontWeight="bold" bg="gray.50">
                    <Td>{total.category}</Td>
                    <Td isNumeric>{total.total_cost !== null ? formatCurrency(total.total_cost) : '-'}</Td>
                    <Td isNumeric>{total.impacted_members}</Td>
                    <Td isNumeric>-</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    );
  };
  
  // Create ACA Preventive table
  const renderACATable = () => {
    if (acaLoading && !acaData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">ACA Preventive</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (acaError && !acaData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">ACA Preventive</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load ACA preventive data</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    if (!acaData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">ACA Preventive</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No ACA preventive data found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">ACA Preventive</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th>Category</Th>
                  <Th isNumeric>Total Cost</Th>
                  <Th isNumeric>Impacted Members</Th>
                  <Th isNumeric>Claim Count</Th>
                </Tr>
              </Thead>
              <Tbody>
                {acaData.filter((item: any) => item.category !== 'Total Impacted Members').map((category: any, index: number) => (
                  <Tr key={index}>
                    <Td fontWeight="medium">{category.category}</Td>
                    <Td isNumeric>{formatCurrency(category.total_cost || 0)}</Td>
                    <Td isNumeric>{category.impacted_members}</Td>
                    <Td isNumeric>{category.claim_count || 0}</Td>
                  </Tr>
                ))}
                {acaData.filter((item: any) => item.category === 'Total Impacted Members').map((total: any, index: number) => (
                  <Tr key={`total-${index}`} fontWeight="bold" bg="gray.50">
                    <Td>{total.category}</Td>
                    <Td isNumeric>{total.total_cost !== null ? formatCurrency(total.total_cost) : '-'}</Td>
                    <Td isNumeric>{total.impacted_members}</Td>
                    <Td isNumeric>-</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    );
  };
  
  // Create Rebate Financial Analysis table
  const renderRebateTable = () => {
    // Add debug logging to help diagnose issues
    console.log("Rendering rebate table with data:", rebateData);
    console.log("Rebate loading state:", rebateLoading);
    console.log("Rebate error state:", rebateError);
    
    if (rebateLoading && !rebateData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Rebate Financial Analysis</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (rebateError && !rebateData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Rebate Financial Analysis</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load rebate financial analysis data: {rebateError}</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    // Check if there is no data or if the data is empty
    const hasNoData = !rebateData || 
                     !rebateData.results || 
                     (rebateData.results && 
                      (!rebateData.results.total_plan_cost || 
                       rebateData.results.total_plan_cost === 0));
                      
    if (hasNoData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Rebate Financial Analysis</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No rebate financial analysis data found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    // Getting the rebate data from the exact structure shown in the example
    const resultsData = rebateData.results;
    const totalPlanCost = resultsData.total_plan_cost || 0;
    const eligibleClaimCount = resultsData.eligible_claim_count || 0;
    const eligibleMemberCount = resultsData.eligible_member_count || 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">Rebate Financial Analysis</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th isNumeric>Total Plan Cost</Th>
                  <Th isNumeric>Eligible Claims</Th>
                  <Th isNumeric>Eligible Members</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td isNumeric>{formatCurrency(totalPlanCost)}</Td>
                  <Td isNumeric>{eligibleClaimCount}</Td>
                  <Td isNumeric>{eligibleMemberCount}</Td>
                </Tr>
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    );
  };
  
  // Create Retiree Drug Subsidy (RDS) table
  const renderRDSTable = () => {
    // Add debug logging to help diagnose issues
    console.log("Rendering RDS table with data:", rdsData);
    console.log("RDS loading state:", rdsLoading);
    console.log("RDS error state:", rdsError);
    
    if (rdsLoading && !rdsData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Retiree Drug Subsidy</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (rdsError && !rdsData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Retiree Drug Subsidy</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load Retiree Drug Subsidy data: {rdsError}</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    // Check if there is no data or if the data is empty
    // Handle the case where API returns success but with null data
    const hasNoData = !rdsData || 
                     rdsData === null ||
                     !rdsData.results || 
                     rdsData.results === null ||
                     (rdsData.results && 
                      (!rdsData.results.eligible_member_count || 
                       rdsData.results.eligible_member_count === 0));
                      
    if (hasNoData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Retiree Drug Subsidy</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No Retiree Drug Subsidy data found. Savings analysis has not yet been run or no eligible members were found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    // Getting the RDS data from the exact structure shown in the example
    const resultsData = rdsData.results;
    // Double-check all values and use default values to prevent runtime errors
    const eligibleMemberCount = resultsData?.eligible_member_count || 0;
    const totalRdsPlanCost = resultsData?.total_rds_plan_cost || 0;
    const estimatedRdsSavings = resultsData?.estimated_rds_savings || 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">Retiree Drug Subsidy</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th isNumeric>Eligible Members</Th>
                  <Th isNumeric>Total RDS Plan Cost</Th>
                  <Th isNumeric>Estimated RDS Savings</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td isNumeric>{eligibleMemberCount}</Td>
                  <Td isNumeric>{formatCurrency(totalRdsPlanCost)}</Td>
                  <Td isNumeric color="green.600">{formatCurrency(estimatedRdsSavings)}</Td>
                </Tr>
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    );
  };
  
  // Create Patient Assistance Program (PAP) table
  const renderPAPTable = () => {
    // Add debug logging to help diagnose issues
    console.log("Rendering PAP table with data:", papData);
    console.log("PAP loading state:", papLoading);
    console.log("PAP error state:", papError);
    
    if (papLoading && !papData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">PAP</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (papError && !papData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">PAP</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load Patient Assistance Program data: {papError}</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    // Check if there is no data or if the data is empty
    // Handle the case where API returns success but with null data
    const hasNoData = !papData || 
                      papData === null ||
                      !papData.results || 
                      papData.results === null ||
                      (papData.results && 
                       (!papData.results.total_pap_claims || 
                        papData.results.total_pap_claims === 0));
                      
    if (hasNoData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">PAP</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No Patient Assistance Program data found. Savings analysis has not yet been run or no eligible claims were found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    // Getting the PAP data from the API structure
    const resultsData = papData.results;
    let papFinancialCallout = resultsData;
    
    // Handle both direct format and nested format
    if (resultsData.pap_financial_callout) {
      papFinancialCallout = resultsData.pap_financial_callout;
    }
    
    // Extract fields with safe defaults
    const totalPapClaims = papFinancialCallout?.total_pap_claims || 0;
    const impactedMembers = papFinancialCallout?.impacted_members || 0;
    const papGrossCost = papFinancialCallout?.pap_gross_cost || 0;
    const papFees = papFinancialCallout?.pap_fees || 0;
    const papSavings = papFinancialCallout?.pap_savings || 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">PAP</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th isNumeric>Claims</Th>
                  <Th isNumeric>Members</Th>
                  <Th isNumeric>Gross Cost</Th>
                  <Th isNumeric>Fees (25%)</Th>
                  <Th isNumeric>Savings (75%)</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td isNumeric>{totalPapClaims}</Td>
                  <Td isNumeric>{impactedMembers}</Td>
                  <Td isNumeric>{formatCurrency(papGrossCost)}</Td>
                  <Td isNumeric>{formatCurrency(papFees)}</Td>
                  <Td isNumeric color="green.600">{formatCurrency(papSavings)}</Td>
                </Tr>
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    );
  };
  
  // Create Hospital at Home Network Solutions (HANS) table
  const renderHANSTable = () => {
    // Add debug logging to help diagnose issues
    console.log("Rendering HANS table with data:", hansData);
    console.log("HANS loading state:", hansLoading);
    console.log("HANS error state:", hansError);
    
    if (hansLoading && !hansData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">HANS</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (hansError && !hansData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">HANS</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load Hospital at Home Network Solutions data: {hansError}</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    // Check if there is no data or if the data is empty
    // Handle the case where API returns success but with null data
    const hasNoData = !hansData || 
                      hansData === null ||
                      !hansData.results || 
                      hansData.results === null ||
                      (hansData.results && 
                       (!hansData.results.total_claims || 
                        hansData.results.total_claims === 0));
                      
    if (hasNoData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">HANS</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No Hospital at Home Network Solutions data found. Savings analysis has not yet been run or no eligible claims were found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    // Getting the HANS data from the API structure
    const resultsData = hansData.results;
    let hansFinancialCallout = resultsData;
    
    // Handle both direct format and nested format
    if (resultsData.hans_financial_callout) {
      hansFinancialCallout = resultsData.hans_financial_callout;
    }
    
    // Extract fields with safe defaults
    const totalClaims = hansFinancialCallout?.total_claims || 0;
    const impactedMembers = hansFinancialCallout?.impacted_members || 0;
    const savings = hansFinancialCallout?.savings || 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">HANS</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th isNumeric>Claims</Th>
                  <Th isNumeric>Members</Th>
                  <Th isNumeric>Savings</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td isNumeric>{totalClaims}</Td>
                  <Td isNumeric>{impactedMembers}</Td>
                  <Td isNumeric color="green.600">{formatCurrency(savings)}</Td>
                </Tr>
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    );
  };

  // Create Maintenance & Acute table
  const renderMaintenanceAcuteTable = () => {
    // Add debug logging to help diagnose issues
    console.log("Rendering Maintenance & Acute table with data:", maData);
    console.log("Maintenance & Acute loading state:", maLoading);
    console.log("Maintenance & Acute error state:", maError);
    
    if (maLoading && !maData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Maintenance & Acute</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (maError && !maData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Maintenance & Acute</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load Maintenance & Acute data: {maError}</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    // Check if there is no data or if the data is empty
    // Handle the case where API returns success but with null data
    const hasNoData = !maData || 
                      maData === null ||
                      !maData.results || 
                      maData.results === null ||
                      (maData.results && 
                       maData.results.length === 0);
                      
    if (hasNoData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Maintenance & Acute</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No Maintenance & Acute data found. Savings analysis has not yet been run or no eligible claims were found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    // Getting the MA data from the API structure
    const resultsData = maData.results || [];
    
    // Calculate totals for the footer row
    const totalClaims = resultsData.reduce((sum: number, item: any) => sum + (parseInt(item.total_claims) || 0), 0);
    const totalMembers = resultsData.reduce((sum: number, item: any) => sum + (parseInt(item.impacted_members) || 0), 0);
    const totalPlanCost = resultsData.reduce((sum: number, item: any) => sum + (parseFloat(item.total_plan_cost) || 0), 0);
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">Maintenance & Acute</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th>Medication Type</Th>
                  <Th isNumeric>Total Claims</Th>
                  <Th isNumeric>Impacted Members</Th>
                  <Th isNumeric>Total Plan Cost</Th>
                </Tr>
              </Thead>
              <Tbody>
                {resultsData.map((category: any, index: number) => (
                  <Tr key={index}>
                    <Td fontWeight="medium">{category.medication_type}</Td>
                    <Td isNumeric>{category.total_claims}</Td>
                    <Td isNumeric>{category.impacted_members}</Td>
                    <Td isNumeric>{formatCurrency(category.total_plan_cost)}</Td>
                  </Tr>
                ))}
                <Tr fontWeight="bold" bg="gray.50">
                  <Td>Total</Td>
                  <Td isNumeric>{totalClaims}</Td>
                  <Td isNumeric>{totalMembers}</Td>
                  <Td isNumeric>{formatCurrency(totalPlanCost)}</Td>
                </Tr>
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    );
  };

  // Create Weight Based table
  const renderWeightBasedTable = () => {
    // Add debug logging to help diagnose issues
    console.log("Rendering Weight Based table with data:", cciData);
    console.log("Weight Based loading state:", cciLoading);
    console.log("Weight Based error state:", cciError);
    
    if (cciLoading && !cciData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Weight Based</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (cciError && !cciData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Weight Based</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load Weight Based data: {cciError}</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    // Check if there is no data or if the data is empty
    // Handle the case where API returns success but with null data
    const hasNoData = !cciData || 
                      cciData === null ||
                      !cciData.results || 
                      cciData.results === null;
                      
    if (hasNoData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Weight Based</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No Weight Based data found. Savings analysis has not yet been run or no eligible claims were found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    // Getting the CCI data from the API structure
    const resultsData = cciData.results || {};
    
    // Extract values with safe defaults
    const totalWeightClaims = resultsData.total_weight_claims || 0;
    const totalCost = resultsData.total_cost || 0;
    const impactedMembers = resultsData.impacted_members || 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">Weight Based</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th isNumeric>Total Claims</Th>
                  <Th isNumeric>Impacted Members</Th>
                  <Th isNumeric>Total Cost</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td isNumeric>{totalWeightClaims}</Td>
                  <Td isNumeric>{impactedMembers}</Td>
                  <Td isNumeric>{formatCurrency(totalCost)}</Td>
                </Tr>
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    );
  };

  // Create MCAP table
  const renderMcapTable = () => {
    // Add debug logging to help diagnose issues
    console.log("Rendering MCAP table with data:", mcapData);
    console.log("MCAP loading state:", mcapLoading);
    console.log("MCAP error state:", mcapError);
    
    if (mcapLoading && !mcapData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">MCAP</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (mcapError && !mcapData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">MCAP</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load MCAP data: {mcapError}</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    // Extract the data from the nested structure that comes from the API
    let resultsData;
    
    // Check for different possible data structures from the API
    if (mcapData && mcapData.results) {
      resultsData = mcapData.results;
    } else if (mcapData) {
      resultsData = mcapData;
    } else {
      // Handle no data case
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">MCAP</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No MCAP data found. Savings analysis has not yet been run or no eligible claims were found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    console.log("MCAP resultsData:", resultsData);
    
    // Extract values with safe defaults
    const memberCount = resultsData.member_count || 0;
    const claimCount = resultsData.claim_count || 0;
    const totalMcapSavings = resultsData.total_mcap_savings || 0;
    const totalFees = resultsData.total_fees || 0;
    const totalNetSavings = resultsData.total_net_savings || 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">MCAP</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th isNumeric>Claims</Th>
                  <Th isNumeric>Members</Th>
                  <Th isNumeric>Gross Savings</Th>
                  <Th isNumeric>Fees (25%)</Th>
                  <Th isNumeric>Net Savings (75%)</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td isNumeric>{claimCount}</Td>
                  <Td isNumeric>{memberCount}</Td>
                  <Td isNumeric>{formatCurrency(totalMcapSavings)}</Td>
                  <Td isNumeric>{formatCurrency(totalFees)}</Td>
                  <Td isNumeric color="green.600">{formatCurrency(totalNetSavings)}</Td>
                </Tr>
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    );
  };

  // Create IDS table
  const renderIdsTable = () => {
    // Add debug logging to help diagnose issues
    console.log("Rendering IDS table with data:", idsData);
    console.log("IDS loading state:", idsLoading);
    console.log("IDS error state:", idsError);
    
    if (idsLoading && !idsData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">IDS</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (idsError && !idsData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">IDS</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load IDS data: {idsError}</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    // Extract the data from the nested structure that comes from the API
    let resultsData;
    
    // Check for different possible data structures from the API
    if (idsData && idsData.results) {
      resultsData = idsData.results;
    } else if (idsData) {
      resultsData = idsData;
    } else {
      // Handle no data case
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">IDS</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No IDS data found. Savings analysis has not yet been run or no eligible claims were found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    console.log("IDS resultsData:", resultsData);
    
    // Extract values with safe defaults
    const memberCount = resultsData.member_count || 0;
    const claimCount = resultsData.claim_count || 0;
    const totalIrxLessMap = resultsData.total_irx_less_map || 0;
    const totalRxmanageCost = resultsData.total_rxmanage_cost || 0;
    const totalSavings = resultsData.total_savings || 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">IDS</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th isNumeric>Claims</Th>
                  <Th isNumeric>Members</Th>
                  <Th isNumeric>IRx Less MAP</Th>
                  <Th isNumeric>RxManage Cost</Th>
                  <Th isNumeric>Savings</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td isNumeric>{claimCount}</Td>
                  <Td isNumeric>{memberCount}</Td>
                  <Td isNumeric>{formatCurrency(totalIrxLessMap)}</Td>
                  <Td isNumeric>{formatCurrency(totalRxmanageCost)}</Td>
                  <Td isNumeric color="green.600">{formatCurrency(totalSavings)}</Td>
                </Tr>
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    );
  };
  
  // Create Parity Pricing table
  const renderSppParityTable = () => {
    // Add debug logging to help diagnose issues
    console.log("Rendering Parity Pricing table with data:", sppData);
    console.log("Parity Pricing loading state:", sppLoading);
    console.log("Parity Pricing error state:", sppError);
    
    if (sppLoading && !sppData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Parity Pricing</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (sppError && !sppData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Parity Pricing</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load Parity Pricing data: {sppError}</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    // Extract the data from the nested structure that comes from the API
    let resultsData;
    
    // Check for different possible data structures from the API
    if (sppData && sppData.results) {
      resultsData = sppData.results;
    } else if (sppData) {
      resultsData = sppData;
    } else {
      // Handle no data case
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Parity Pricing</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No Parity Pricing data found. Savings analysis has not yet been run or no eligible claims were found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    console.log("Parity Pricing resultsData:", resultsData);
    
    // Extract values with safe defaults
    const impactedMembers = resultsData.impacted_members || 0;
    const parityClaimCount = resultsData.parity_claim_count || 0;
    const totalExposure = resultsData.total_exposure || 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">Parity Pricing</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th isNumeric>Total Claims</Th>
                  <Th isNumeric>Impacted Members</Th>
                  <Th isNumeric>Total Exposure</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td isNumeric>{parityClaimCount}</Td>
                  <Td isNumeric>{impactedMembers}</Td>
                  <Td isNumeric>{formatCurrency(totalExposure)}</Td>
                </Tr>
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>
    );
  };
  
  // Create DAW Penalties table
  const renderDawPenaltiesTable = () => {
    // Add debug logging to help diagnose issues
    console.log("Rendering DAW Penalties table with data:", dawData);
    console.log("DAW Penalties loading state:", dawLoading);
    console.log("DAW Penalties error state:", dawError);
    
    if (dawLoading && !dawData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">DAW Penalties</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (dawError && !dawData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">DAW Penalties</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load DAW Penalties data: {dawError}</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    // Extract the data from the nested structure that comes from the API
    let resultsData;
    
    // Check for different possible data structures from the API
    if (dawData && dawData.results) {
      resultsData = dawData.results;
    } else if (dawData) {
      resultsData = dawData;
    } else {
      // Handle no data case
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">DAW Penalties</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No DAW Penalties data found. Savings analysis has not yet been run or no eligible claims were found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    console.log("DAW Penalties resultsData:", resultsData);
    
    // Extract values with safe defaults
    const impactedMembers = resultsData.impacted_members || 0;
    const totalDawClaims = resultsData.total_daw_claims || 0;
    const totalDawSavings = resultsData.total_daw_savings || 0;
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">DAW Penalties</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th isNumeric>Total Claims</Th>
                  <Th isNumeric>Impacted Members</Th>
                  <Th isNumeric>Total Savings</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td isNumeric>{totalDawClaims}</Td>
                  <Td isNumeric>{impactedMembers}</Td>
                  <Td isNumeric color="green.600">{formatCurrency(totalDawSavings)}</Td>
                </Tr>
              </Tbody>
            </Table>
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
  
  // Create Contract Savings table
  const renderContractSavingsTable = () => {
    if (contractSavingsLoading && !contractSavingsData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Reprice Savings</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Box display="flex" justifyContent="center" p={4}>
              <Spinner size="md" />
            </Box>
          </CardBody>
        </Card>
      );
    }
    
    if (contractSavingsError && !contractSavingsData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Reprice Savings</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Alert status="error" variant="subtle">
              <AlertIcon />
              <Text>Failed to load contract savings data</Text>
            </Alert>
          </CardBody>
        </Card>
      );
    }
    
    if (!contractSavingsData) {
      return (
        <Card variant="outline" mb={4}>
          <CardHeader px={6} py={4}>
            <Heading size="md">Reprice Savings</Heading>
          </CardHeader>
          <CardBody px={6} pt={0} pb={4}>
            <Text p={4} textAlign="center">No contract savings data found.</Text>
          </CardBody>
        </Card>
      );
    }
    
    return (
      <Card variant="outline" mb={4}>
        <CardHeader px={6} py={4}>
          <Heading size="md">Reprice Savings</Heading>
        </CardHeader>
        <CardBody px={6} pt={0} pb={4}>
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr bg="gray.50">
                  <Th>Exclusion Type</Th>
                  <Th isNumeric>Incumbent Plan Cost</Th>
                  <Th isNumeric>Illuminate Plan Cost</Th>
                  <Th isNumeric>Member Count</Th>
                  <Th isNumeric>Claim Count</Th>
                  <Th isNumeric>Gross Savings</Th>
                </Tr>
              </Thead>
              <Tbody>
                {contractSavingsData.filter((item: any) => item.exclusion_type !== 'Total').map((category: any, index: number) => (
                  <Tr key={index}>
                    <Td fontWeight="medium">{category.exclusion_type}</Td>
                    <Td isNumeric>{formatCurrency(category.incumbent_plan_cost)}</Td>
                    <Td isNumeric>{formatCurrency(category.illuminate_plan_cost)}</Td>
                    <Td isNumeric>{category.member_count}</Td>
                    <Td isNumeric>{category.claim_count}</Td>
                    <Td isNumeric color="green.600" fontWeight="medium">{formatCurrency(category.gross_savings)}</Td>
                  </Tr>
                ))}
                {contractSavingsData.filter((item: any) => item.exclusion_type === 'Total').map((total: any, index: number) => (
                  <Tr key={`total-${index}`} fontWeight="bold" bg="gray.50">
                    <Td>Total</Td>
                    <Td isNumeric>{formatCurrency(total.incumbent_plan_cost)}</Td>
                    <Td isNumeric>{formatCurrency(total.illuminate_plan_cost)}</Td>
                    <Td isNumeric>{total.member_count}</Td>
                    <Td isNumeric>{total.claim_count}</Td>
                    <Td isNumeric color="green.600">{formatCurrency(total.gross_savings)}</Td>
                  </Tr>
                ))}
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
        <>
          {renderContractSavingsTable()}
        </>
      )}
      
      {/* Additional Savings Tab Content */}
      {activeTab === 'additional' && (
        <>
          {/* HDHP Preventive Table */}
          {renderHDHPTable()}
          
          {/* ACA Preventive Table */}
          {renderACATable()}
          
          {/* Rebate Financial Analysis Table */}
          {renderRebateTable()}
          
          {/* Retiree Drug Subsidy (RDS) Table */}
          {renderRDSTable()}
          
          {/* Patient Assistance Program (PAP) Table */}
          {renderPAPTable()}
          
          {/* Hospital at Home Network Solutions (HANS) Table */}
          {renderHANSTable()}
          
          {/* Maintenance & Acute Table */}
          {renderMaintenanceAcuteTable()}
          
          {/* Weight Based Table */}
          {renderWeightBasedTable()}
          
          {/* MCAP Table */}
          {renderMcapTable()}
          
          {/* IDS Table */}
          {renderIdsTable()}
          
          {/* Parity Pricing Table */}
          {renderSppParityTable()}
          
          {/* DAW Penalties Table */}
          {renderDawPenaltiesTable()}
        </>
      )}
    </VStack>
  );
}