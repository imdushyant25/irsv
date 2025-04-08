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
import { RebateConfig, RebateType, PerClaimRebates, LumpSumRebates } from '@/types/parameters';

interface FourthPBMRebatesProps {
  value: RebateConfig;
  onChange: (value: RebateConfig) => void;
}

type RebateField = {
  key: keyof PerClaimRebates;
  label: string;
};

const REBATE_FIELDS: RebateField[] = [
  { key: 'nonSpecialtyBrand30DS', label: 'Retail Brand (30)' },
  { key: 'nonSpecialtyBrand90DS', label: 'Retail Brand (90)' },
  { key: 'nonSpecialtyMailBrand', label: 'Mail Brand' },
  { key: 'specialtyBrand', label: 'Specialty Brand' },
];

export const FourthPBMRebates: React.FC<FourthPBMRebatesProps> = ({ value, onChange }) => {
  const handleTypeChange = (type: string) => {
    // Create base configuration
    const baseConfig: RebateConfig = {
      type: type as RebateType,
    };

    if (type === 'perClaim') {
      baseConfig.perClaimRebates = {
        nonSpecialtyBrand30DS: '',
        nonSpecialtyBrand90DS: '',
        nonSpecialtyMailBrand: '',
        specialtyBrand: ''
      };
    } else if (type === 'lumpSum') {
      baseConfig.lumpSumRebates = {
        amount: '',
        nonSpecialtyBrandPercentage: '',
        specialtyBrandPercentage: ''
      };
    }

    onChange(baseConfig);
  };

  const handlePerClaimChange = (field: keyof PerClaimRebates) => (valueString: string) => {
    // Update perClaimRebates field with required values
    const updatedPerClaimRebates: PerClaimRebates = {
      nonSpecialtyBrand30DS: '',
      nonSpecialtyBrand90DS: '',
      nonSpecialtyMailBrand: '',
      specialtyBrand: '',
      ...value.perClaimRebates,
      [field]: valueString
    };
    
    onChange({
      ...value,
      perClaimRebates: updatedPerClaimRebates
    });
  };

  const handleLumpSumChange = (field: keyof LumpSumRebates) => (valueString: string) => {
    // Update lumpSumRebates field with required values
    const updatedLumpSumRebates: LumpSumRebates = {
      amount: '',
      nonSpecialtyBrandPercentage: '',
      specialtyBrandPercentage: '',
      ...value.lumpSumRebates,
      [field]: valueString
    };
    
    onChange({
      ...value,
      lumpSumRebates: updatedLumpSumRebates
    });
  };

  const renderPerClaimFields = () => (
    <Stack as="div" spacing={3} pl={6}>
      {REBATE_FIELDS.map((field) => (
        <FormControl key={field.key} isRequired>
          <FormLabel>{field.label}</FormLabel>
          <NumberInput
            value={value?.perClaimRebates?.[field.key] || ''}
            onChange={handlePerClaimChange(field.key)}
            min={0}
            // Remove precision limit to allow any number of decimals
            // Remove step size constraint
          >
            <NumberInputField />
          </NumberInput>
        </FormControl>
      ))}
    </Stack>
  );

  const renderLumpSumField = () => (
    <Stack as="div" spacing={3} pl={6}>
      <FormControl>
        <FormLabel>Lump Sum Amount</FormLabel>
        <NumberInput
          value={value?.lumpSumRebates?.amount || ''}
          onChange={handleLumpSumChange('amount')}
          min={0}
        >
          <NumberInputField />
        </NumberInput>
      </FormControl>
      <FormControl>
        <FormLabel>Non-Specialty Brand Percentage</FormLabel>
        <NumberInput
          value={value?.lumpSumRebates?.nonSpecialtyBrandPercentage || ''}
          onChange={handleLumpSumChange('nonSpecialtyBrandPercentage')}
          min={0}
          max={100}
        >
          <NumberInputField />
        </NumberInput>
      </FormControl>
      <FormControl>
        <FormLabel>Specialty Brand Percentage</FormLabel>
        <NumberInput
          value={value?.lumpSumRebates?.specialtyBrandPercentage || ''}
          onChange={handleLumpSumChange('specialtyBrandPercentage')}
          min={0}
          max={100}
        >
          <NumberInputField />
        </NumberInput>
      </FormControl>
    </Stack>
  );

  return (
    <Box as="section">
      <Stack as="div" spacing={4}>
        <Heading size="sm">4th PBM Rebates</Heading>
        
        <RadioGroup value={value.type} onChange={handleTypeChange}>
          <Stack as="div" spacing={4}>
            <Radio value="useFromClaims">
              <Stack as="div" spacing={1}>
                <Text fontWeight="medium">Use From Claims</Text>
              </Stack>
            </Radio>

            <Radio value="perClaim">
              <Stack as="div" spacing={1}>
                <Text fontWeight="medium">Per Claim</Text>
              </Stack>
            </Radio>
            {value.type === 'perClaim' && renderPerClaimFields()}

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