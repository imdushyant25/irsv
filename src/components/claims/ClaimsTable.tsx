// File: src/components/claims/ClaimsTable.tsx
'use client';

import React, { useMemo, useState } from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Box,
  Text,
  Spinner,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Tooltip,
  ButtonGroup,
  Flex,
  HStack,
  Select,
} from '@chakra-ui/react';
import { Eye, MoreVertical, AlertCircle, Download, Sliders } from 'lucide-react';
import { Pagination } from '@/components/common/Pagination';
import { formatDate } from '@/utils/format';

interface ClaimRecord {
  recordId: string;
  rowNumber: number;
  mappedFields: Record<string, any>;
  unmappedFields: Record<string, any>;
  dynamicFields?: Record<string, any>;
  validationStatus: string;
  processingStatus: string;
  createdAt: string;
}

interface ClaimsTableProps {
  claims: ClaimRecord[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  onViewDetails?: (claim: ClaimRecord) => void;
}

export function ClaimsTable({
  claims,
  currentPage,
  totalPages,
  onPageChange,
  isLoading = false,
  onViewDetails
}: ClaimsTableProps) {
  // State for column display preferences
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
  const [columnSize, setColumnSize] = useState<'compact' | 'normal' | 'wide'>('normal');

  const formatDateToYYYYMMDD = (dateString: string | number): string => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return String(dateString);
      }
      
      // Format as YYYY-MM-DD
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0'); // Add leading zero
      const day = String(date.getDate()).padStart(2, '0'); // Add leading zero
      
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return String(dateString);
    }
  };

  /**
   * Fixed columns based on specified requirements
   */
  const columns = useMemo(() => {
    // Fixed set of columns in the specified order
    return ['Row', 'NDC11', 'Quantity', 'Fill_Date', 'Days_Supply'];
  }, []);

  /**
   * Get the color for status badges
   */
  const getStatusColor = (status: string): string => {
    status = status.toLowerCase();
    switch (status) {
      case 'valid':
        return 'green';
      case 'invalid':
        return 'red';
      case 'warning':
        return 'yellow';
      case 'processed':
        return 'blue';
      case 'failed':
        return 'red';
      case 'pending':
      case 'pending_validation':
        return 'orange';
      default:
        return 'gray';
    }
  };

  /**
   * Handle table density changes
   */
  const handleDensityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setColumnSize(e.target.value as 'compact' | 'normal' | 'wide');
  };

  if (isLoading) {
    return (
      <Box textAlign="center" py={8}>
        <Spinner size="lg" />
        <Text mt={2} color="gray.600">Loading claims data...</Text>
      </Box>
    );
  }

  if (claims.length === 0) {
    return (
      <Box textAlign="center" py={8} borderWidth="1px" borderRadius="lg">
        <Text color="gray.500">No claims found</Text>
        <Text fontSize="sm" color="gray.400" mt={2}>
          Try adjusting your filters or refreshing the data
        </Text>
      </Box>
    );
  }

  // Calculate table size based on user preference
  const tableSize = columnSize === 'compact' ? 'sm' : columnSize === 'wide' ? 'lg' : 'md';

  return (
    <Box>
      {/* Main Table */}
      <Box overflowX="auto" borderWidth="1px" borderRadius="lg">
        <Table variant="simple" size={tableSize}>
          <Thead bg="gray.50">
            <Tr>
              {columns.map((header) => (
                <Th key={header}>{header}</Th>
              ))}
              <Th textAlign="right">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {claims.map((claim) => (
              <Tr key={claim.recordId} _hover={{ bg: 'gray.50' }}>
                {/* Row Number */}
                <Td>{claim.rowNumber}</Td>
                
                {/* NDC11 */}
                <Td>
                  {claim.mappedFields['ndc11'] !== undefined 
                    ? String(claim.mappedFields['ndc11'])
                    : <Text fontSize="xs" color="gray.400">N/A</Text>
                  }
                </Td>
                
                {/* Quantity */}
                <Td>
                  {claim.mappedFields['quantity'] !== undefined 
                    ? String(claim.mappedFields['quantity'])
                    : <Text fontSize="xs" color="gray.400">N/A</Text>
                  }
                </Td>
                
                {/* Fill_Date */}
                <Td>
                  {claim.mappedFields['fill_date'] !== undefined 
                    ? formatDateToYYYYMMDD(String(claim.mappedFields['fill_date']))
                    : <Text fontSize="xs" color="gray.400">N/A</Text>
                  }
                </Td>
                
                {/* Days_Supply */}
                <Td>
                  {claim.mappedFields['days_supply'] !== undefined 
                    ? String(claim.mappedFields['days_supply'])
                    : <Text fontSize="xs" color="gray.400">0</Text>
                  }
                </Td>
                
                {/* Actions column */}
                <Td textAlign="right">
                  <ButtonGroup size="sm" variant="ghost" spacing={1}>
                    <Tooltip label="View Details">
                      <IconButton
                        aria-label="View claim details"
                        icon={<Eye size={16} />}
                        onClick={() => onViewDetails?.(claim)}
                      />
                    </Tooltip>
                    
                    <Menu>
                      <MenuButton
                        as={IconButton}
                        aria-label="More options"
                        icon={<MoreVertical size={16} />}
                      />
                      <MenuList fontSize="sm">
                        <MenuItem icon={<Download size={16} />}>
                          Export as JSON
                        </MenuItem>
                        {claim.validationStatus.toLowerCase() === 'invalid' && (
                          <MenuItem icon={<AlertCircle size={16} />} color="red.500">
                            View Validation Errors
                          </MenuItem>
                        )}
                      </MenuList>
                    </Menu>
                  </ButtonGroup>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>

      {/* Pagination */}
      <Box mt={4}>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      </Box>
    </Box>
  );
}