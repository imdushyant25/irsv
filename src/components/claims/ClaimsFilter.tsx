// File: src/components/claims/ClaimsFilter.tsx
'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  HStack,
  Input,
  Select,
  IconButton,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  VStack,
  Button,
  FormControl,
  FormLabel,
  Divider,
  RangeSlider,
  RangeSliderTrack,
  RangeSliderFilledTrack,
  RangeSliderThumb,
  Text,
  useDisclosure,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Stack,
  Badge,
  InputGroup,
  InputLeftElement,
  Tooltip,
} from '@chakra-ui/react';
import { Filter, Search, X, DollarSign, CalendarDays } from 'lucide-react';
import { debounce } from 'lodash';

interface FilterState {
  validationStatus: string;
  processingStatus: string;
  searchTerm: string;
  costRange?: [number, number];
  dateRange?: {
    start: string;
    end: string;
  };
}

interface ClaimsFilterProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  totalResults?: number;
}

export function ClaimsFilter({ filters, onChange, totalResults }: ClaimsFilterProps) {
  const { isOpen, onToggle, onClose } = useDisclosure();
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);
  const [costRange, setCostRange] = useState<[number, number]>([0, 1000]);

  // Debounced search handler
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      const newFilters = { ...localFilters, searchTerm: value };
      setLocalFilters(newFilters);
      onChange(newFilters);
    }, 300),
    [localFilters, onChange]
  );

  const handleFilterChange = (
    field: keyof FilterState,
    value: string | [number, number] | { start: string; end: string }
  ) => {
    const newFilters = { ...localFilters, [field]: value };
    setLocalFilters(newFilters);
  };

  const handleCostRangeChange = (range: [number, number]) => {
    setCostRange(range);
  };

  const handleDateRangeChange = (field: 'start' | 'end', value: string) => {
    const currentRange = localFilters.dateRange || { start: '', end: '' };
    const newRange = { ...currentRange, [field]: value };
    handleFilterChange('dateRange', newRange);
  };

  const getActiveFilterCount = (): number => {
    let count = 0;
    if (localFilters.validationStatus) count++;
    if (localFilters.processingStatus) count++;
    if (localFilters.searchTerm) count++;
    if (localFilters.costRange) count++;
    if (localFilters.dateRange?.start || localFilters.dateRange?.end) count++;
    return count;
  };

  const clearFilters = () => {
    const clearedFilters: FilterState = {
      validationStatus: '',
      processingStatus: '',
      searchTerm: '',
      costRange: undefined,
      dateRange: undefined,
    };
    setLocalFilters(clearedFilters);
    setCostRange([0, 1000]);
    onChange(clearedFilters);
    onClose();
  };

  const applyFilters = () => {
    onChange(localFilters);
    onClose();
  };

  return (
    <Box>
      <Stack
        direction={{ base: 'column', md: 'row' }}
        spacing={4}
        align={{ base: 'stretch', md: 'center' }}
        mb={4}
      >
        {/* Search Input */}
        <InputGroup maxW={{ base: 'full', md: '300px' }}>
          <InputLeftElement>
            <Search size={16} />
          </InputLeftElement>
          <Input
            placeholder="Search claims..."
            value={localFilters.searchTerm}
            onChange={(e) => debouncedSearch(e.target.value)}
          />
        </InputGroup>

        {/* Quick Status Filters */}
        <Select
          value={localFilters.validationStatus}
          onChange={(e) => handleFilterChange('validationStatus', e.target.value)}
          placeholder="Validation Status"
          maxW={{ base: 'full', md: '200px' }}
        >
          <option value="valid">Valid</option>
          <option value="invalid">Invalid</option>
          <option value="warning">Warning</option>
        </Select>

        <Select
          value={localFilters.processingStatus}
          onChange={(e) => handleFilterChange('processingStatus', e.target.value)}
          placeholder="Processing Status"
          maxW={{ base: 'full', md: '200px' }}
        >
          <option value="processed">Processed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </Select>

        {/* Advanced Filters */}
        <Popover
          isOpen={isOpen}
          onClose={onClose}
          placement="bottom-end"
        >
          <PopoverTrigger>
            <Button
              leftIcon={<Filter size={16} />}
              variant="outline"
              colorScheme={getActiveFilterCount() > 0 ? 'blue' : 'gray'}
              onClick={onToggle}
            >
              Filters
              {getActiveFilterCount() > 0 && (
                <Badge ml={2} colorScheme="blue" borderRadius="full">
                  {getActiveFilterCount()}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent width="400px">
            <PopoverHeader fontWeight="semibold">
              Advanced Filters
            </PopoverHeader>
            <PopoverBody>
              <VStack spacing={4} align="stretch">
                {/* Cost Range Filter */}
                <FormControl>
                  <FormLabel>Cost Range</FormLabel>
                  <HStack>
                    <InputGroup size="sm">
                      <InputLeftElement>
                        <DollarSign size={14} />
                      </InputLeftElement>
                      <NumberInput
                        value={costRange[0]}
                        onChange={(_, value) => handleCostRangeChange([value, costRange[1]])}
                        min={0}
                      >
                        <NumberInputField pl={8} />
                        <NumberInputStepper>
                          <NumberIncrementStepper />
                          <NumberDecrementStepper />
                        </NumberInputStepper>
                      </NumberInput>
                    </InputGroup>
                    <Text>to</Text>
                    <InputGroup size="sm">
                      <InputLeftElement>
                        <DollarSign size={14} />
                      </InputLeftElement>
                      <NumberInput
                        value={costRange[1]}
                        onChange={(_, value) => handleCostRangeChange([costRange[0], value])}
                        min={costRange[0]}
                      >
                        <NumberInputField pl={8} />
                        <NumberInputStepper>
                          <NumberIncrementStepper />
                          <NumberDecrementStepper />
                        </NumberInputStepper>
                      </NumberInput>
                    </InputGroup>
                  </HStack>
                  <RangeSlider
                    aria-label={['min', 'max']}
                    value={costRange}
                    onChange={handleCostRangeChange}
                    min={0}
                    max={1000}
                    step={10}
                    mt={2}
                  >
                    <RangeSliderTrack>
                      <RangeSliderFilledTrack />
                    </RangeSliderTrack>
                    <RangeSliderThumb index={0} />
                    <RangeSliderThumb index={1} />
                  </RangeSlider>
                </FormControl>

                <Divider />

                {/* Date Range Filter */}
                <FormControl>
                  <FormLabel>Date Range</FormLabel>
                  <HStack>
                    <Input
                      type="date"
                      value={localFilters.dateRange?.start || ''}
                      onChange={(e) => handleDateRangeChange('start', e.target.value)}
                      size="sm"
                    />
                    <Text>to</Text>
                    <Input
                      type="date"
                      value={localFilters.dateRange?.end || ''}
                      onChange={(e) => handleDateRangeChange('end', e.target.value)}
                      size="sm"
                    />
                  </HStack>
                </FormControl>
              </VStack>
            </PopoverBody>
            <PopoverFooter>
              <HStack justify="space-between">
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<X size={16} />}
                  onClick={clearFilters}
                >
                  Clear All
                </Button>
                <Button
                  colorScheme="blue"
                  size="sm"
                  onClick={applyFilters}
                >
                  Apply Filters
                </Button>
              </HStack>
            </PopoverFooter>
          </PopoverContent>
        </Popover>

        {/* Clear Filters Button */}
        {getActiveFilterCount() > 0 && (
          <Tooltip label="Clear all filters">
            <IconButton
              aria-label="Clear filters"
              icon={<X size={16} />}
              variant="ghost"
              onClick={clearFilters}
            />
          </Tooltip>
        )}
      </Stack>

      {/* Results Count */}
      {totalResults !== undefined && (
        <Text fontSize="sm" color="gray.600">
          {totalResults.toLocaleString()} {totalResults === 1 ? 'result' : 'results'} found
        </Text>
      )}
    </Box>
  );
}