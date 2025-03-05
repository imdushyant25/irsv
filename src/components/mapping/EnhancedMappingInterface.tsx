// File: src/components/mapping/EnhancedMappingInterface.tsx
// Part 1: Imports and Component Setup

import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Button,
  Switch,
  Text,
  useToast,
  Progress,
  Card,
  Badge,
  Flex,
  IconButton,
  Tooltip,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  List,
  ListItem,
  ListIcon,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  SimpleGrid,
  Input,
  Select,
  useDisclosure
} from '@chakra-ui/react';
import { Wand2, AlertCircle, Check, AlertOctagon } from 'lucide-react';
import { StandardField, RequirementLevel, FieldDataType } from '@/types/mapping';
import { FileRecord } from '@/types/file';
import { calculateStringSimilarity } from '@/utils/string';
import FieldSelector from './FieldSelector';
import { intelligentAutoMap } from '@/utils/mapping';

interface EnhancedMappingInterfaceProps {
  fileId: string;
  sourceHeaders: string[];
  initialMapping?: Record<string, string>;
  onSaveMapping: (mapping: Record<string, string>) => Promise<void>;
  onLoadTemplate?: (templateId: string) => Promise<Record<string, string> | undefined>;
  onSaveTemplate?: (name: string, mapping: Record<string, string>) => Promise<void>;
}

export default function EnhancedMappingInterface({
  fileId,
  sourceHeaders = [],
  initialMapping = {},
  onSaveMapping,
  onLoadTemplate,
  onSaveTemplate
}: EnhancedMappingInterfaceProps) {
  // State management
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);
  const [standardFields, setStandardFields] = useState<StandardField[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoMappingInProgress, setAutoMappingInProgress] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [templateName, setTemplateName] = useState('');
  const [allowPartialMapping, setAllowPartialMapping] = useState(false);
  const [unmappedFields, setUnmappedFields] = useState<StandardField[]>([]);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [hasExistingMapping, setHasExistingMapping] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();


  // Memoized field grouping
  const groupedFields = useMemo(() => {
    return {
      required: standardFields.filter(f => 
        f.requirementLevel === RequirementLevel.REQUIRED || 
        f.requirementLevel === RequirementLevel.CRITICAL
      ),
      recommended: standardFields.filter(f => f.requirementLevel === RequirementLevel.RECOMMENDED),
      optional: standardFields.filter(f => f.requirementLevel === RequirementLevel.OPTIONAL)
    };
  }, [standardFields]);

  // Calculate mapping progress
  const progress = useMemo(() => {
    const requiredMapped = groupedFields.required.filter(f => 
      Object.values(mapping).includes(f.id)
    ).length;
    const totalRequired = groupedFields.required.length;
    return totalRequired === 0 ? 0 : (requiredMapped / totalRequired) * 100;
  }, [mapping, groupedFields]);

  // Initial data fetch
  useEffect(() => {
    const loadData = async () => {
      // First fetch standard fields
      await fetchStandardFields();
      // Then check for existing mapping
      const hasMapping = await checkExistingMapping();
      
      // Only run auto-mapping if no existing mapping was found
      if (!hasMapping && Object.keys(mapping).length === 0) {
        handleAutoMap(standardFields);
      }
    };
    
    loadData();
  }, []);

  // Update mapping when initialMapping changes
  useEffect(() => {
    if (Object.keys(initialMapping).length > 0) {
      setMapping(initialMapping);
      setHasExistingMapping(true);
    }
  }, [initialMapping]);

  const checkExistingMapping = async () => {
    try {
      const response = await fetch(`/api/files/${fileId}/mapping`);
      if (response.ok) {
        const data = await response.json();
        if (data.mappings && data.mappings.length > 0) {
          // Convert the mappings array to the format we need
          const existingMapping: Record<string, string> = {};
          data.mappings.forEach((mapping: any) => {
            existingMapping[mapping.sourceColumn] = mapping.standardFieldId;
          });
          
          setMapping(existingMapping);
          setHasExistingMapping(true);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Error checking existing mapping:', error);
      return false;
    }
  };

  const fetchStandardFields = async () => {
    try {
      const response = await fetch('/api/mapping/standard-fields?productId=IRSV');
      if (!response.ok) throw new Error('Failed to fetch standard fields');
      const data = await response.json();
      setStandardFields(data);
      return data;
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load standard fields',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleAutoMapClick = (fields: StandardField[]) => {
    if (hasExistingMapping) {
      // Show a confirmation dialog
      if (window.confirm('This file already has a mapping. Running auto-map will replace the existing mapping. Continue?')) {
        handleAutoMap(fields);
      }
    } else {
      handleAutoMap(fields);
    }
  };

  const handleAutoMap = async (fields: StandardField[]) => {
    setAutoMappingInProgress(true);
    try {
      // Fetch field variations from the API
      const variationsResponse = await fetch('/api/mapping/field-variations');
      if (!variationsResponse.ok) {
        throw new Error('Failed to fetch field variations');
      }
      const fieldVariations = await variationsResponse.json();
      
      // Use the new intelligent mapping function
      const result = await intelligentAutoMap(sourceHeaders, fields, fieldVariations);
      
      setMapping(result.mapping);
      validateMapping(result.mapping);
      
      toast({
        title: 'Auto-mapping Complete',
        description: `Successfully mapped ${Object.keys(result.mapping).length} fields (${result.exactMatches} exact, ${result.variationMatches} variation, ${result.similarityMatches} similarity)`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Auto-mapping Failed',
        description: 'Failed to automatically map fields',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setAutoMappingInProgress(false);
    }
  };

  const validateMapping = (currentMapping: Record<string, string> = mapping): boolean => {
    // First check critical fields - these can never be skipped
    const unmappedCritical = standardFields.filter(field => 
      field.requirementLevel === RequirementLevel.CRITICAL && 
      !Object.values(currentMapping).includes(field.id)
    );
  
    if (unmappedCritical.length > 0) {
      setValidationErrors(
        unmappedCritical.reduce((acc, field) => ({
          ...acc,
          [field.id]: `${field.displayName} is critical and must be mapped`
        }), {})
      );
      return false;
    }
  
    // Then check other required fields if partial mapping is not allowed
    if (!allowPartialMapping) {
      const unmappedRequired = standardFields.filter(field => 
        field.requirementLevel === RequirementLevel.REQUIRED && 
        !Object.values(currentMapping).includes(field.id)
      );
  
      if (unmappedRequired.length > 0) {
        setValidationErrors(
          unmappedRequired.reduce((acc, field) => ({
            ...acc,
            [field.id]: `${field.displayName} is required`
          }), {})
        );
        return false;
      }
    }
  
    setValidationErrors({});
    return true;
  };

  const handleSaveAttempt = () => {
    const unmappedCritical = standardFields.filter(field => 
      field.requirementLevel === RequirementLevel.CRITICAL && 
      !Object.values(mapping).includes(field.id)
    );
  
    if (unmappedCritical.length > 0) {
      toast({
        title: 'Critical Fields Required',
        description: 'All critical fields must be mapped before saving.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      return;
    }
  
    const isValid = validateMapping();
    
    if (!isValid) {
      if (allowPartialMapping) {
        const unmappedRequired = standardFields.filter(field => 
          field.requirementLevel === RequirementLevel.REQUIRED && 
          !Object.values(mapping).includes(field.id)
        );
        setUnmappedFields(unmappedRequired);
        setShowConfirmationModal(true);
      } else {
        toast({
          title: 'Validation Error',
          description: 'All required fields must be mapped before saving.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
      return;
    }
  
    handleSaveMapping();
  };
  
const handleSaveMapping = async () => {
  try {
    await onSaveMapping(mapping);
    toast({
      title: 'Success',
      description: 'Mapping saved successfully',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
    setShowConfirmationModal(false);
  } catch (error) {
    toast({
      title: 'Error',
      description: 'Failed to save mapping',
      status: 'error',
      duration: 5000,
      isClosable: true,
    });
  }
};

const handleConfirmPartialMapping = () => {
  setShowConfirmationModal(false);
  handleSaveMapping();
};

const handleLoadTemplate = async (templateId: string) => {
  if (!onLoadTemplate || !templateId) return;
  
  try {
    setLoading(true);
    const templateMapping = await onLoadTemplate(templateId);
    if (templateMapping) {
      setMapping(templateMapping);
      toast({
        title: 'Success',
        description: 'Template loaded successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    }
  } catch (error) {
    toast({
      title: 'Error',
      description: 'Failed to load template',
      status: 'error',
      duration: 5000,
      isClosable: true,
    });
  } finally {
    setLoading(false);
  }
};

const handleSaveTemplate = async () => {
  if (!onSaveTemplate || !templateName.trim()) return;
  
  try {
    setLoading(true);
    await onSaveTemplate(templateName, mapping);
    toast({
      title: 'Success',
      description: 'Template saved successfully',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
    onClose();
    setTemplateName('');
  } catch (error) {
    toast({
      title: 'Error',
      description: 'Failed to save template',
      status: 'error',
      duration: 5000,
      isClosable: true,
    });
  } finally {
    setLoading(false);
  }
};

const renderFieldCard = (field: StandardField) => {
  const isMapped = Object.values(mapping).includes(field.id);
  const sourceHeader = Object.entries(mapping).find(([_, id]) => id === field.id)?.[0];
  const hasError = !!validationErrors[field.id];
  const isCritical = field.requirementLevel === RequirementLevel.CRITICAL;

  return (
    <Card 
      key={field.id}
      p={4}
      borderColor={hasError ? 'red.300' : isMapped ? 'green.300' : isCritical ? 'orange.300' : 'gray.200'}
      borderWidth={2}
      bg={isMapped ? 'green.50' : isCritical ? 'orange.50' : 'white'}
    >
      <VStack align="stretch" spacing={2}>
        <HStack justify="space-between">
          <HStack>
            {isCritical && (
              <Tooltip label="Critical Field - Must be mapped">
                <Box color="orange.500">
                  <AlertOctagon size={16} />
                </Box>
              </Tooltip>
            )}
            <Text fontWeight="bold">{field.displayName}</Text>
          </HStack>
          <Badge 
            colorScheme={isMapped ? 'green' : isCritical ? 'orange' : 'gray'}
            variant="subtle"
          >
            {isMapped ? 'Mapped' : 'Unmapped'}
          </Badge>
        </HStack>
        
        <Box>
          <Select
            placeholder="Select source column"
            value={sourceHeader || ''}
            onChange={(e) => {
              const newMapping = { ...mapping };
              if (sourceHeader) {
                delete newMapping[sourceHeader];
              }
              if (e.target.value) {
                newMapping[e.target.value] = field.id;
              }
              setMapping(newMapping);
              validateMapping(newMapping);
            }}
            isDisabled={loading}
            borderColor={isCritical ? 'orange.200' : undefined}
            _hover={{ borderColor: isCritical ? 'orange.300' : undefined }}
          >
            {sourceHeaders
              .filter(header => !Object.keys(mapping).includes(header) || header === sourceHeader)
              .map(header => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))
            }
          </Select>
        </Box>

        {hasError && (
          <Text fontSize="sm" color="red.500">
            {validationErrors[field.id]}
          </Text>
        )}

        <Tooltip label={field.description || 'No description available'}>
          <Text fontSize="xs" color="gray.500">
            Type: {field.dataType.toLowerCase()}
            {isCritical && ' • Critical'}
            {field.requirementLevel === RequirementLevel.REQUIRED && ' • Required'}
          </Text>
        </Tooltip>
      </VStack>
    </Card>
  );
};


if (loading) {
  return (
    <Box textAlign="center" py={8}>
      <Progress size="xs" isIndeterminate />
      <Text mt={4}>Loading fields...</Text>
    </Box>
  );
}

return (
  <Box>
    {/* Progress and Actions Bar */}
    <Box mb={6} p={4} bg="white" borderRadius="lg" shadow="sm">
      <VStack spacing={4}>
        <HStack w="100%" justify="space-between" align="center">
          <HStack spacing={4}>
            <Switch
              id="allow-partial"
              isChecked={allowPartialMapping}
              onChange={(e) => setAllowPartialMapping(e.target.checked)}
            />
            <Text>Allow partial mapping of required fields</Text>
          </HStack>
          <Text fontWeight="bold">
            {progress.toFixed(0)}% Complete
          </Text>
        </HStack>
        
        <Progress
          value={progress}
          w="100%"
          colorScheme={progress === 100 ? 'green' : 'blue'}
          borderRadius="full"
        />

        {allowPartialMapping && (
          <Alert status="info">
            <AlertIcon />
            <AlertDescription>
              When enabled, you can save the mapping even if some required fields are not mapped.
              This may impact the quality of analysis.
            </AlertDescription>
          </Alert>
        )}

        <HStack spacing={4}>
          <Button
            leftIcon={<Wand2 size={18} />}
            onClick={() => handleAutoMapClick(standardFields)}
            isLoading={autoMappingInProgress}
            variant="outline"
            isDisabled={loading}
          >
            {hasExistingMapping ? "Re-run Auto-map" : "Auto-map Fields"}
          </Button>
          <Button
            leftIcon={<Check size={18} />}
            onClick={handleSaveAttempt}
            colorScheme="blue"
          >
            Save Mapping
          </Button>
        </HStack>
      </VStack>
    </Box>

    {/* Field Mapping Tabs */}
    <Tabs variant="enclosed">
      <TabList>
        <Tab>Required Fields ({groupedFields.required.length})</Tab>
        <Tab>Recommended Fields ({groupedFields.recommended.length})</Tab>
        <Tab>Optional Fields ({groupedFields.optional.length})</Tab>
      </TabList>

      <TabPanels>
        <TabPanel>
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
            {groupedFields.required.map(renderFieldCard)}
          </SimpleGrid>
        </TabPanel>
        <TabPanel>
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
            {groupedFields.recommended.map(renderFieldCard)}
          </SimpleGrid>
        </TabPanel>
        <TabPanel>
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
            {groupedFields.optional.map(renderFieldCard)}
          </SimpleGrid>
        </TabPanel>
      </TabPanels>
    </Tabs>

    {/* Confirmation Modal for Partial Mapping */}
    <Modal 
      isOpen={showConfirmationModal} 
      onClose={() => setShowConfirmationModal(false)}
      size="lg"
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Unmapped Required Fields</ModalHeader>
        <ModalBody>
          <Alert status="warning" mb={4}>
            <AlertIcon />
            <Box>
              <Text fontWeight="bold" mb={2}>
                The following required fields are not mapped:
              </Text>
              <List spacing={2}>
                {unmappedFields.map((field) => (
                  <ListItem key={field.id} display="flex" alignItems="center">
                    <ListIcon as={AlertCircle} color="orange.500" />
                    <Text>
                      {field.displayName}
                      <Text as="span" color="gray.500" ml={1} fontSize="sm">
                        ({field.fieldName})
                      </Text>
                    </Text>
                  </ListItem>
                ))}
              </List>
            </Box>
          </Alert>
          <Text>
            Proceeding without mapping these required fields may affect data quality and analysis capabilities. 
            Are you sure you want to continue?
          </Text>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="ghost"
            mr={3}
            onClick={() => setShowConfirmationModal(false)}
          >
            Cancel
          </Button>
          <Button
            colorScheme="orange"
            onClick={handleConfirmPartialMapping}
          >
            Save Partial Mapping
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>

    {/* Save Template Modal */}
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Save Mapping Template</ModalHeader>
        <ModalBody>
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Enter template name"
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button
            colorScheme="blue"
            onClick={handleSaveTemplate}
            isLoading={loading}
            isDisabled={!templateName.trim()}
          >
            Save Template
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  </Box>
);
}