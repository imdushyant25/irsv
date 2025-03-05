// File: src/components/claims/ClaimsTable.tsx
'use client';

import React, { useState } from 'react';
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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  VStack,
  HStack,
  useDisclosure,
  Tooltip,
  Divider,
} from '@chakra-ui/react';
import { Eye, MoreVertical, AlertCircle } from 'lucide-react';
import { Pagination } from '@/components/common/Pagination';
import { formatDate } from '@/utils/format';

interface ClaimRecord {
  recordId: string;
  rowNumber: number;
  mappedFields: Record<string, any>;
  unmappedFields: Record<string, any>;
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
}

export function ClaimsTable({
  claims,
  currentPage,
  totalPages,
  onPageChange,
  isLoading = false
}: ClaimsTableProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedClaim, setSelectedClaim] = useState<ClaimRecord | null>(null);

  const handleViewDetails = (claim: ClaimRecord) => {
    setSelectedClaim(claim);
    onOpen();
  };

  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'valid':
        return 'green';
      case 'invalid':
        return 'red';
      case 'warning':
        return 'yellow';
      case 'processed':
        return 'blue';
      default:
        return 'gray';
    }
  };

  if (isLoading) {
    return (
      <Box textAlign="center" py={8}>
        <Spinner size="xl" />
      </Box>
    );
  }

  if (claims.length === 0) {
    return (
      <Box textAlign="center" py={8}>
        <Text color="gray.500">No claims found</Text>
      </Box>
    );
  }

  // Get column headers from the first claim's mapped fields
  const mappedFieldHeaders = claims[0] ? Object.keys(claims[0].mappedFields) : [];

  return (
    <>
      <Box overflowX="auto">
        <Table variant="simple">
          <Thead>
            <Tr>
              <Th>Row</Th>
              {mappedFieldHeaders.map(header => (
                <Th key={header}>{header}</Th>
              ))}
              <Th>Validation</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {claims.map((claim) => (
              <Tr key={claim.recordId}>
                <Td>{claim.rowNumber}</Td>
                {mappedFieldHeaders.map(header => (
                  <Td key={header}>
                    {String(claim.mappedFields[header] || '')}
                  </Td>
                ))}
                <Td>
                  <Badge colorScheme={getStatusColor(claim.validationStatus)}>
                    {claim.validationStatus}
                  </Badge>
                </Td>
                <Td>
                  <Badge colorScheme={getStatusColor(claim.processingStatus)}>
                    {claim.processingStatus}
                  </Badge>
                </Td>
                <Td>
                  <HStack spacing={2}>
                    <Tooltip label="View Details">
                      <IconButton
                        aria-label="View claim details"
                        icon={<Eye size={16} />}
                        size="sm"
                        variant="ghost"
                        onClick={() => handleViewDetails(claim)}
                      />
                    </Tooltip>
                    <Menu>
                      <MenuButton
                        as={IconButton}
                        aria-label="More options"
                        icon={<MoreVertical size={16} />}
                        variant="ghost"
                        size="sm"
                      />
                      <MenuList>
                        <MenuItem icon={<AlertCircle size={16} />}>
                          View Validation Details
                        </MenuItem>
                      </MenuList>
                    </Menu>
                  </HStack>
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

      {/* Claim Details Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Claim Details</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedClaim && (
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontWeight="bold" mb={2}>Mapped Fields</Text>
                  <VStack align="stretch" spacing={2}>
                    {Object.entries(selectedClaim.mappedFields).map(([key, value]) => (
                      <HStack key={key} justify="space-between">
                        <Text color="gray.600">{key}</Text>
                        <Text>{String(value)}</Text>
                      </HStack>
                    ))}
                  </VStack>
                </Box>

                <Divider />

                <Box>
                  <Text fontWeight="bold" mb={2}>Unmapped Fields</Text>
                  <VStack align="stretch" spacing={2}>
                    {Object.entries(selectedClaim.unmappedFields).map(([key, value]) => (
                      <HStack key={key} justify="space-between">
                        <Text color="gray.600">{key}</Text>
                        <Text>{String(value)}</Text>
                      </HStack>
                    ))}
                  </VStack>
                </Box>

                <Divider />

                <Box>
                  <Text fontWeight="bold" mb={2}>Processing Information</Text>
                  <VStack align="stretch" spacing={2}>
                    <HStack justify="space-between">
                      <Text color="gray.600">Row Number</Text>
                      <Text>{selectedClaim.rowNumber}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text color="gray.600">Validation Status</Text>
                      <Badge colorScheme={getStatusColor(selectedClaim.validationStatus)}>
                        {selectedClaim.validationStatus}
                      </Badge>
                    </HStack>
                    <HStack justify="space-between">
                      <Text color="gray.600">Processing Status</Text>
                      <Badge colorScheme={getStatusColor(selectedClaim.processingStatus)}>
                        {selectedClaim.processingStatus}
                      </Badge>
                    </HStack>
                    <HStack justify="space-between">
                      <Text color="gray.600">Created At</Text>
                      <Text>{formatDate(selectedClaim.createdAt)}</Text>
                    </HStack>
                  </VStack>
                </Box>
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}