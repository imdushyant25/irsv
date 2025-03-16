// File: src/components/claims/ClaimDetailPanel.tsx
import React from 'react';
import {
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  VStack,
  HStack,
  Text,
  Badge,
  Box,
  Heading,
  Divider,
  Table,
  Tbody,
  Tr,
  Td,
  TableContainer,
  Flex,
  Button,
  useClipboard,
  Tooltip
} from '@chakra-ui/react';
import { Copy, Check } from 'lucide-react';
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

interface ClaimDetailPanelProps {
  claim: ClaimRecord;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * A slide-out panel that displays detailed information about a claim
 */
export default function ClaimDetailPanel({ claim, isOpen, onClose }: ClaimDetailPanelProps) {
  const { hasCopied, onCopy } = useClipboard(JSON.stringify(claim, null, 2));

  /**
   * Get color for status badge
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
   * Render a record/object as key-value pairs in a table
   */
  const renderKeyValueTable = (data: Record<string, any>) => {
    const entries = Object.entries(data);
    
    if (entries.length === 0) {
      return <Text color="gray.500" fontSize="sm">No data available</Text>;
    }

    return (
      <TableContainer>
        <Table size="sm" variant="simple">
          <Tbody>
            {entries.map(([key, value]) => (
              <Tr key={key}>
                <Td fontWeight="medium" width="40%">{key}</Td>
                <Td>
                  {typeof value === 'object' && value !== null
                    ? JSON.stringify(value)
                    : String(value)
                  }
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <Drawer
      isOpen={isOpen}
      placement="right"
      onClose={onClose}
      size="lg"
    >
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px">
          <VStack align="flex-start" spacing={1}>
            <Heading size="md">
              Claim Details
            </Heading>
            <Text color="gray.600" fontSize="sm">
              Row #{claim.rowNumber} / Created At - {formatDate(claim.createdAt)}
            </Text>
          </VStack>
        </DrawerHeader>

        <DrawerBody p={4}>
          <VStack spacing={6} align="stretch">

            {/* Claim Data */}
            <Tabs variant="enclosed" colorScheme="blue" size="sm">
              <TabList>
                <Tab>Mapped Fields</Tab>
                <Tab>Unmapped Fields</Tab>
                {claim.dynamicFields && Object.keys(claim.dynamicFields).length > 0 && (
                  <Tab>Enriched Fields</Tab>
                )}
                <Tab>Raw JSON</Tab>
              </TabList>

              <TabPanels>
                {/* Mapped Fields */}
                <TabPanel>
                  <Box maxH="500px" overflowY="auto">
                    {renderKeyValueTable(claim.mappedFields)}
                  </Box>
                </TabPanel>

                {/* Unmapped Fields */}
                <TabPanel>
                  <Box maxH="500px" overflowY="auto">
                    {renderKeyValueTable(claim.unmappedFields)}
                  </Box>
                </TabPanel>

                {/* Enriched Fields (if available) */}
                {claim.dynamicFields && Object.keys(claim.dynamicFields).length > 0 && (
                  <TabPanel>
                    <Box maxH="500px" overflowY="auto">
                      {renderKeyValueTable(claim.dynamicFields)}
                    </Box>
                  </TabPanel>
                )}

                {/* Raw JSON */}
                <TabPanel>
                  <VStack align="stretch" spacing={2}>
                    <HStack justify="flex-end">
                      <Tooltip label={hasCopied ? "Copied!" : "Copy to clipboard"}>
                        <Button
                          size="xs"
                          leftIcon={hasCopied ? <Check size={14} /> : <Copy size={14} />}
                          onClick={onCopy}
                        >
                          {hasCopied ? "Copied" : "Copy"}
                        </Button>
                      </Tooltip>
                    </HStack>
                    <Box
                      bg="gray.50"
                      p={3}
                      borderRadius="md"
                      fontFamily="mono"
                      fontSize="xs"
                      maxH="500px"
                      overflowY="auto"
                      whiteSpace="pre-wrap"
                    >
                      {JSON.stringify(claim, null, 2)}
                    </Box>
                  </VStack>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </VStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}