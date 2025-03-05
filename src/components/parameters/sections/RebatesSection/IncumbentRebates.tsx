// File: src/components/parameters/sections/RebatesSection/IncumbentRebates.tsx

import React from 'react';
import {
  VStack,
  Heading,
  RadioGroup,
  Radio,
  Stack,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  Text,
} from '@chakra-ui/react';
import { RebateConfig } from '@/types/parameters';

interface IncumbentRebatesProps {
  value: RebateConfig;
  onChange: (value: RebateConfig) => void;
}

export function IncumbentRebates({
  value,
  onChange
}: IncumbentRebatesProps) {
  const handleTypeChange = (type: string) => {
    onChange({
      ...value,
      type: type as 'detailed' | 'lumpSum'
    });
  };

  const handleValueChange = (field: string) => (valueString: string) => {
    // No longer formatting the currency - allowing any precision
    onChange({
      ...value,
      [field]: valueString
    });
  };

  return (
    <VStack align="stretch" spacing={4}>
      <Heading size="sm">Incumbent Rebates</Heading>
      
      <RadioGroup value={value.type} onChange={handleTypeChange}>
        <Stack spacing={4}>
          <Radio value="detailed">
            <Text fontWeight="medium">Detailed Breakdown</Text>
            <Text fontSize="sm" color="gray.600">
              Specify individual rebate values for each category
            </Text>
          </Radio>
          
          {value.type === 'detailed' && (
            <VStack spacing={3} pl={6}>
              <FormControl>
                <FormLabel>Retail Brand (30)</FormLabel>
                <NumberInput
                  value={value.retailBrand30}
                  onChange={handleValueChange('retailBrand30')}
                  min={0}
                  // Removed precision and step constraints
                  //placeholder="Enter value"
                >
                  <NumberInputField />
                </NumberInput>
              </FormControl>

              <FormControl>
                <FormLabel>Retail Brand (90)</FormLabel>
                <NumberInput
                  value={value.retailBrand90}
                  onChange={handleValueChange('retailBrand90')}
                  min={0}
                  // Removed precision and step constraints
                  //placeholder="Enter value"
                >
                  <NumberInputField />
                </NumberInput>
              </FormControl>

              <FormControl>
                <FormLabel>Mail Brand</FormLabel>
                <NumberInput
                  value={value.mailBrand}
                  onChange={handleValueChange('mailBrand')}
                  min={0}
                  // Removed precision and step constraints
                  //placeholder="Enter value"
                >
                  <NumberInputField />
                </NumberInput>
              </FormControl>

              <FormControl>
                <FormLabel>Specialty Brand</FormLabel>
                <NumberInput
                  value={value.specialtyBrand}
                  onChange={handleValueChange('specialtyBrand')}
                  min={0}
                  // Removed precision and step constraints
                  //placeholder="Enter value"
                >
                  <NumberInputField />
                </NumberInput>
              </FormControl>
            </VStack>
          )}

          <Radio value="lumpSum">
            <Text fontWeight="medium">Lump Sum</Text>
            <Text fontSize="sm" color="gray.600">
              Specify a single total rebate amount
            </Text>
          </Radio>
          
          {value.type === 'lumpSum' && (
            <FormControl pl={6}>
              <FormLabel>Lump Sum Amount</FormLabel>
              <NumberInput
                value={value.lumpSum}
                onChange={handleValueChange('lumpSum')}
                min={0}
                // Removed precision and step constraints
                //placeholder="Enter total amount"
              >
                <NumberInputField />
              </NumberInput>
            </FormControl>
          )}
        </Stack>
      </RadioGroup>
    </VStack>
  );
}