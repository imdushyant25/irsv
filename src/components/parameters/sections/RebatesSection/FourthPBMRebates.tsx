// File: src/components/parameters/sections/RebatesSection/FourthPBMRebates.tsx

import React from 'react';
import type { BoxProps, StackProps } from '@chakra-ui/react';
import {
  Heading,
  RadioGroup,
  Radio,
  Stack,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  InputGroup,
  InputLeftElement,
  Text,
  Box,
} from '@chakra-ui/react';
import { RebateConfig } from '@/types/parameters';

interface FourthPBMRebatesProps {
  value: RebateConfig;
  onChange: (value: RebateConfig) => void;
}

type RebateField = {
  key: keyof Pick<RebateConfig, 'retailBrand30' | 'retailBrand90' | 'mailBrand' | 'specialtyBrand'>;
  label: string;
};

const REBATE_FIELDS: RebateField[] = [
  { key: 'retailBrand30', label: 'Retail Brand (30)' },
  { key: 'retailBrand90', label: 'Retail Brand (90)' },
  { key: 'mailBrand', label: 'Mail Brand' },
  { key: 'specialtyBrand', label: 'Specialty Brand' },
];

export const FourthPBMRebates: React.FC<FourthPBMRebatesProps> = ({ value, onChange }) => {
  const handleTypeChange = (type: string) => {
    // Create base configuration
    const baseConfig: RebateConfig = {
      type: type as 'contractTerms' | 'detailed' | 'lumpSum',
      useContractTerms: type === 'contractTerms',
      retailBrand30: '',
      retailBrand90: '',
      mailBrand: '',
      specialtyBrand: '',
      lumpSum: ''
    };

    onChange(baseConfig);
  };

  const handleValueChange = (field: keyof RebateConfig) => (valueString: string) => {
    // Allow any numeric value with any decimal precision
    onChange({
      ...value,
      [field]: valueString
    });
  };

  const renderDetailedFields = () => (
    <Stack as="div" spacing={3} pl={6}>
      {REBATE_FIELDS.map((field) => (
        <FormControl key={field.key} isRequired>
          <FormLabel>{field.label}</FormLabel>
          <NumberInput
            value={value[field.key] || ''}
            onChange={handleValueChange(field.key)}
            min={0}
            // Remove precision limit to allow any number of decimals
            // Remove step size constraint
            //placeholder="Enter value"
          >
            <NumberInputField />
          </NumberInput>
        </FormControl>
      ))}
    </Stack>
  );

  const renderLumpSumField = () => (
    <FormControl pl={6}>
      <FormLabel>Lump Sum Amount</FormLabel>
      <NumberInput
        value={value.lumpSum || ''}
        onChange={handleValueChange('lumpSum')}
        min={0}
        // Remove precision limit to allow any number of decimals
        // Remove step size constraint
        //placeholder="Enter total amount"
      >
        <NumberInputField />
      </NumberInput>
    </FormControl>
  );

  return (
    <Box as="section">
      <Stack as="div" spacing={4}>
        <Heading size="sm">4th PBM Rebates</Heading>
        
        <RadioGroup value={value.type} onChange={handleTypeChange}>
          <Stack as="div" spacing={4}>
            <Radio value="contractTerms">
              <Stack as="div" spacing={1}>
                <Text fontWeight="medium">Use Contract Terms</Text>
              </Stack>
            </Radio>

            <Radio value="detailed">
              <Stack as="div" spacing={1}>
                <Text fontWeight="medium">Detailed Breakdown</Text>
              </Stack>
            </Radio>
            {value.type === 'detailed' && renderDetailedFields()}

            <Radio value="lumpSum">
              <Stack as="div" spacing={1}>
                <Text fontWeight="medium">Lump Sum</Text>
              </Stack>
            </Radio>
            {value.type === 'lumpSum' && renderLumpSumField()}
          </Stack>
        </RadioGroup>
      </Stack>
    </Box>
  );
};