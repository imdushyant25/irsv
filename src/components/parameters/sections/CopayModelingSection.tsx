// File: src/components/parameters/sections/CopayModelingSection.tsx

import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Heading,
  VStack,
  FormControl,
  FormLabel,
  Input,
  Radio,
  RadioGroup,
  Stack,
  Text,
  SimpleGrid,
  HStack,
  InputGroup,
  InputLeftAddon,
  Box,
  Divider,
} from '@chakra-ui/react';
import { CopayModelingParameters, MemberCopays, MemberCoinsurance, CoinsuranceAmount } from '@/types/parameters';

// Default values for the different options
const DEFAULT_MEMBER_COPAYS: MemberCopays = {
  nsRetailGeneric30: '',
  nsRetailPreferredBrand30: '',
  nsRetailNonPreferredBrand30: '',
  nsRetailGeneric90: '',
  nsRetailPreferredBrand90: '',
  nsRetailNonPreferredBrand90: '',
  nsMailGeneric90: '',
  nsMailPreferredBrand90: '',
  nsMailNonPreferredBrand90: '',
  specialtyGeneric: '',
  specialtyPreferredBrand: '',
  specialtyNonPreferredBrand: '',
};

const DEFAULT_COINSURANCE_AMOUNT: CoinsuranceAmount = {
  percentage: '',
  maximum: ''
};

const DEFAULT_MEMBER_COINSURANCE: MemberCoinsurance = {
  nsRetailGeneric30: { ...DEFAULT_COINSURANCE_AMOUNT },
  nsRetailPreferredBrand30: { ...DEFAULT_COINSURANCE_AMOUNT },
  nsRetailNonPreferredBrand30: { ...DEFAULT_COINSURANCE_AMOUNT },
  nsRetailGeneric90: { ...DEFAULT_COINSURANCE_AMOUNT },
  nsRetailPreferredBrand90: { ...DEFAULT_COINSURANCE_AMOUNT },
  nsRetailNonPreferredBrand90: { ...DEFAULT_COINSURANCE_AMOUNT },
  nsMailGeneric90: { ...DEFAULT_COINSURANCE_AMOUNT },
  nsMailPreferredBrand90: { ...DEFAULT_COINSURANCE_AMOUNT },
  nsMailNonPreferredBrand90: { ...DEFAULT_COINSURANCE_AMOUNT },
  specialtyGeneric: { ...DEFAULT_COINSURANCE_AMOUNT },
  specialtyPreferredBrand: { ...DEFAULT_COINSURANCE_AMOUNT },
  specialtyNonPreferredBrand: { ...DEFAULT_COINSURANCE_AMOUNT },
};

interface CopayModelingSectionProps {
  value: CopayModelingParameters;
  onChange: (value: CopayModelingParameters) => void;
}

export function CopayModelingSection({
  value,
  onChange
}: CopayModelingSectionProps) {
  // Use a null check to get modelingType with a fallback default
  const modelingType = value?.modelingType || 'useClaimsFile';

  // Handle radio button change
  const handleTypeChange = (newType: 'useClaimsFile' | 'memberCopays' | 'memberCoinsurance') => {
    let newValue: CopayModelingParameters;

    if (newType === 'useClaimsFile') {
      newValue = {
        modelingType: newType,
        memberCopays: undefined,
        memberCoinsurance: undefined
      };
    } else if (newType === 'memberCopays') {
      newValue = {
        modelingType: newType,
        memberCopays: value?.memberCopays || { ...DEFAULT_MEMBER_COPAYS },
        memberCoinsurance: undefined
      };
    } else { // memberCoinsurance
      newValue = {
        modelingType: newType,
        memberCopays: undefined,
        memberCoinsurance: value?.memberCoinsurance || { ...DEFAULT_MEMBER_COINSURANCE }
      };
    }

    onChange(newValue);
  };

  // Handle copay input changes
  const handleCopayChange = (field: keyof MemberCopays) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    onChange({
      ...value,
      modelingType: 'memberCopays',
      memberCopays: {
        ...(value?.memberCopays || DEFAULT_MEMBER_COPAYS),
        [field]: e.target.value
      }
    });
  };

  // Handle coinsurance percentage changes
  const handleCoinsurancePercentageChange = (field: keyof MemberCoinsurance) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const currentCoinsurance = value?.memberCoinsurance?.[field] || { ...DEFAULT_COINSURANCE_AMOUNT };
    
    onChange({
      ...value,
      modelingType: 'memberCoinsurance',
      memberCoinsurance: {
        ...(value?.memberCoinsurance || DEFAULT_MEMBER_COINSURANCE),
        [field]: {
          ...currentCoinsurance,
          percentage: e.target.value
        }
      }
    });
  };

  // Handle coinsurance maximum changes
  const handleCoinsuranceMaximumChange = (field: keyof MemberCoinsurance) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const currentCoinsurance = value?.memberCoinsurance?.[field] || { ...DEFAULT_COINSURANCE_AMOUNT };
    
    onChange({
      ...value,
      modelingType: 'memberCoinsurance',
      memberCoinsurance: {
        ...(value?.memberCoinsurance || DEFAULT_MEMBER_COINSURANCE),
        [field]: {
          ...currentCoinsurance,
          maximum: e.target.value
        }
      }
    });
  };

  // Helper to render a copay input field
  const renderCopayField = (field: keyof MemberCopays, label: string) => {
    return (
      <FormControl>
        <FormLabel>{label}</FormLabel>
        <InputGroup>
          <InputLeftAddon>$</InputLeftAddon>
          <Input 
            value={value?.memberCopays?.[field] || ''} 
            onChange={handleCopayChange(field)}
            placeholder="Enter amount"
          />
        </InputGroup>
      </FormControl>
    );
  };

  // Helper to render a coinsurance input field with maximum
  const renderCoinsuranceField = (field: keyof MemberCoinsurance, label: string) => {
    const fieldValue = value?.memberCoinsurance?.[field] || DEFAULT_COINSURANCE_AMOUNT;
    
    return (
      <FormControl>
        <FormLabel>{label}</FormLabel>
        <HStack spacing={2}>
          <InputGroup size="md">
            <InputLeftAddon>%</InputLeftAddon>
            <Input 
              value={fieldValue.percentage || ''} 
              onChange={handleCoinsurancePercentageChange(field)}
              placeholder="%" 
              width="100px"
            />
          </InputGroup>
          <Text>/</Text>
          <InputGroup size="md">
            <InputLeftAddon>$</InputLeftAddon>
            <Input 
              value={fieldValue.maximum || ''} 
              onChange={handleCoinsuranceMaximumChange(field)}
              placeholder="Max" 
              width="120px"
            />
          </InputGroup>
        </HStack>
      </FormControl>
    );
  };

  return (
    <Card>
      <CardHeader>
        <Heading size="md">Copay (Coinsurance) Modeling</Heading>
      </CardHeader>
      <CardBody>
        <VStack spacing={6} align="stretch">
          <RadioGroup value={modelingType} onChange={handleTypeChange}>
            <Stack direction="column" spacing={4}>
              <Radio value="useClaimsFile">
                <Text fontWeight="medium">Option 1: Use member copays/coinsurances from incumbent claims file</Text>
              </Radio>
              
              <Radio value="memberCopays">
                <Text fontWeight="medium">Option 2: Member copays by channel</Text>
              </Radio>
              
              <Radio value="memberCoinsurance">
                <Text fontWeight="medium">Option 3: Member coinsurance channel w/ maximums</Text>
              </Radio>
            </Stack>
          </RadioGroup>

          {modelingType === 'memberCopays' && (
            <VStack spacing={4} pt={4}>
              <Text fontWeight="medium" alignSelf="flex-start">Member Copays by Channel</Text>
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} width="full">
                {renderCopayField('nsRetailGeneric30', 'NS Retail Generic 30 (Tier 1)')}
                {renderCopayField('nsRetailPreferredBrand30', 'NS Retail Preferred Brand 30 (Tier 2)')}
                {renderCopayField('nsRetailNonPreferredBrand30', 'NS Retail Non-Preferred Brand 30 (Tier 3)')}
                {renderCopayField('nsRetailGeneric90', 'NS Retail Generic 90 (Tier 1)')}
                {renderCopayField('nsRetailPreferredBrand90', 'NS Retail Preferred Brand 90 (Tier 2)')}
                {renderCopayField('nsRetailNonPreferredBrand90', 'NS Retail Non-Preferred Brand 90 (Tier 3)')}
                {renderCopayField('nsMailGeneric90', 'NS Mail Generic 90 (Tier 1)')}
                {renderCopayField('nsMailPreferredBrand90', 'NS Mail Preferred Brand 90 (Tier 2)')}
                {renderCopayField('nsMailNonPreferredBrand90', 'NS Mail Non-Preferred Brand 90 (Tier 3)')}
                {renderCopayField('specialtyGeneric', 'Specialty Generic (Tier 4)')}
                {renderCopayField('specialtyPreferredBrand', 'Specialty Preferred Brand (Tier 5)')}
                {renderCopayField('specialtyNonPreferredBrand', 'Specialty Non-Preferred Brand (Tier 6)')}
              </SimpleGrid>
            </VStack>
          )}

          {modelingType === 'memberCoinsurance' && (
            <VStack spacing={4} pt={4}>
              <Text fontWeight="medium" alignSelf="flex-start">Member Coinsurance Channel w/ Maximums</Text>
              <SimpleGrid columns={{ base: 1, md: 1, lg: 2 }} spacing={4} width="full">
                {renderCoinsuranceField('nsRetailGeneric30', 'NS Retail Generic 30 (Tier 1)')}
                {renderCoinsuranceField('nsRetailPreferredBrand30', 'NS Retail Preferred Brand 30 (Tier 2)')}
                {renderCoinsuranceField('nsRetailNonPreferredBrand30', 'NS Retail Non-Preferred Brand 30 (Tier 3)')}
                {renderCoinsuranceField('nsRetailGeneric90', 'NS Retail Generic 90 (Tier 1)')}
                {renderCoinsuranceField('nsRetailPreferredBrand90', 'NS Retail Preferred Brand 90 (Tier 2)')}
                {renderCoinsuranceField('nsRetailNonPreferredBrand90', 'NS Retail Non-Preferred Brand 90 (Tier 3)')}
                {renderCoinsuranceField('nsMailGeneric90', 'NS Mail Generic 90 (Tier 1)')}
                {renderCoinsuranceField('nsMailPreferredBrand90', 'NS Mail Preferred Brand 90 (Tier 2)')}
                {renderCoinsuranceField('nsMailNonPreferredBrand90', 'NS Mail Non-Preferred Brand 90 (Tier 3)')}
                {renderCoinsuranceField('specialtyGeneric', 'Specialty Generic (Tier 4)')}
                {renderCoinsuranceField('specialtyPreferredBrand', 'Specialty Preferred Brand (Tier 5)')}
                {renderCoinsuranceField('specialtyNonPreferredBrand', 'Specialty Non-Preferred Brand (Tier 6)')}
              </SimpleGrid>
            </VStack>
          )}
        </VStack>
      </CardBody>
    </Card>
  );
}