// File: src/components/parameters/sections/RebatesSection/IncumbentRebates.tsx

import React from 'react';
import {
  VStack,
  FormControl,
  FormLabel,
  RadioGroup,
  Radio,
  Stack,
  InputGroup,
  InputLeftAddon,
  Input,
  FormHelperText,
  Heading,
  Box,
} from '@chakra-ui/react';
import { RebateConfig, RebateType, PerClaimRebates, LumpSumRebates } from '@/types/parameters';

interface IncumbentRebatesProps {
  value: RebateConfig;
  onChange: (value: RebateConfig) => void;
}

export function IncumbentRebates({ value, onChange }: IncumbentRebatesProps) {
  // Default values for the nested objects
  const defaultPerClaimRebates: PerClaimRebates = {
    nonSpecialtyBrand30DS: '',
    nonSpecialtyBrand90DS: '',
    nonSpecialtyMailBrand: '',
    specialtyBrand: ''
  };

  const defaultLumpSumRebates: LumpSumRebates = {
    amount: '',
    nonSpecialtyBrandPercentage: '',
    specialtyBrandPercentage: ''
  };

  // Create a fully populated safe value
  const safeValue: RebateConfig = {
    type: value?.type || 'useFromClaims',
    perClaimRebates: value?.perClaimRebates ? 
      { ...defaultPerClaimRebates, ...value.perClaimRebates } : 
      defaultPerClaimRebates,
    lumpSumRebates: value?.lumpSumRebates ? 
      { ...defaultLumpSumRebates, ...value.lumpSumRebates } : 
      defaultLumpSumRebates
  };

  // Handle radio selection change
  const handleTypeChange = (newType: RebateType) => {
    onChange({
      ...safeValue,
      type: newType
    });
  };

  // Handle per claim input changes
  const handlePerClaimChange = (field: keyof PerClaimRebates, inputValue: string) => {
    // Validate input to allow only numbers and decimal points
    if (!/^(\d*\.?\d*)?$/.test(inputValue) && inputValue !== '') return;
    
    onChange({
      ...safeValue,
      perClaimRebates: {
        ...safeValue.perClaimRebates as PerClaimRebates,
        [field]: inputValue
      }
    });
  };

  // Handle lump sum input changes
  const handleLumpSumChange = (field: keyof LumpSumRebates, inputValue: string) => {
    // Validate input to allow only numbers and decimal points
    if (!/^(\d*\.?\d*)?$/.test(inputValue) && inputValue !== '') return;
    
    onChange({
      ...safeValue,
      lumpSumRebates: {
        ...safeValue.lumpSumRebates as LumpSumRebates,
        [field]: inputValue
      }
    });
  };

  return (
    <VStack align="stretch" spacing={4}>
      <Heading size="sm">Incumbent Rebates</Heading>
      
      <FormControl>
        <RadioGroup 
          value={safeValue.type}
          onChange={(val) => handleTypeChange(val as RebateType)}
        >
          <Stack direction="column" spacing={4}>
            {/* Option 1: Use rebates from incumbent claims file */}
            <Radio value="useFromClaims">
              Use rebates from incumbent claims file
            </Radio>
            
            {/* Option 2: Enter per claim rebates */}
            <Radio value="perClaim">
              Enter per claim rebates
            </Radio>
            
            {/* Per claim inputs */}
            {safeValue.type === 'perClaim' && (
              <VStack spacing={3} pl={6} align="stretch">
                <FormControl>
                  <FormHelperText>
                    Please enter percentages for each category.
                  </FormHelperText>
                </FormControl>
                
                <FormControl>
                  <FormLabel fontSize="sm">Non Specialty Brand 30 DS</FormLabel>
                  <InputGroup size="sm">
                    <InputLeftAddon>%</InputLeftAddon>
                    <Input
                      value={(safeValue.perClaimRebates as PerClaimRebates).nonSpecialtyBrand30DS}
                      onChange={(e) => handlePerClaimChange('nonSpecialtyBrand30DS', e.target.value)}
                      placeholder="Enter percentage"
                    />
                  </InputGroup>
                </FormControl>
                
                <FormControl>
                  <FormLabel fontSize="sm">Non Specialty Brand 90 DS</FormLabel>
                  <InputGroup size="sm">
                    <InputLeftAddon>%</InputLeftAddon>
                    <Input
                      value={(safeValue.perClaimRebates as PerClaimRebates).nonSpecialtyBrand90DS}
                      onChange={(e) => handlePerClaimChange('nonSpecialtyBrand90DS', e.target.value)}
                      placeholder="Enter percentage"
                    />
                  </InputGroup>
                </FormControl>
                
                <FormControl>
                  <FormLabel fontSize="sm">Non Specialty Mail Brand</FormLabel>
                  <InputGroup size="sm">
                    <InputLeftAddon>%</InputLeftAddon>
                    <Input
                      value={(safeValue.perClaimRebates as PerClaimRebates).nonSpecialtyMailBrand}
                      onChange={(e) => handlePerClaimChange('nonSpecialtyMailBrand', e.target.value)}
                      placeholder="Enter percentage"
                    />
                  </InputGroup>
                </FormControl>
                
                <FormControl>
                  <FormLabel fontSize="sm">Specialty Brand</FormLabel>
                  <InputGroup size="sm">
                    <InputLeftAddon>%</InputLeftAddon>
                    <Input
                      value={(safeValue.perClaimRebates as PerClaimRebates).specialtyBrand}
                      onChange={(e) => handlePerClaimChange('specialtyBrand', e.target.value)}
                      placeholder="Enter percentage"
                    />
                  </InputGroup>
                </FormControl>
              </VStack>
            )}
            
            {/* Option 3: Enter lump sum rebates */}
            <Radio value="lumpSum">
              Enter lump sum rebates
            </Radio>
            
            {/* Lump sum inputs */}
            {safeValue.type === 'lumpSum' && (
              <VStack spacing={3} pl={6} align="stretch">
                <FormControl>
                  <FormLabel fontSize="sm">Lump Sum Rebate Amount</FormLabel>
                  <InputGroup size="sm">
                    <InputLeftAddon>$</InputLeftAddon>
                    <Input
                      value={(safeValue.lumpSumRebates as LumpSumRebates).amount}
                      onChange={(e) => handleLumpSumChange('amount', e.target.value)}
                      placeholder="Enter amount"
                    />
                  </InputGroup>
                </FormControl>
                
                <FormControl>
                  <FormLabel fontSize="sm">Non Specialty Brand Percentage</FormLabel>
                  <InputGroup size="sm">
                    <InputLeftAddon>%</InputLeftAddon>
                    <Input
                      value={(safeValue.lumpSumRebates as LumpSumRebates).nonSpecialtyBrandPercentage}
                      onChange={(e) => handleLumpSumChange('nonSpecialtyBrandPercentage', e.target.value)}
                      placeholder="Enter percentage"
                    />
                  </InputGroup>
                </FormControl>
                
                <FormControl>
                  <FormLabel fontSize="sm">Specialty Brand Percentage</FormLabel>
                  <InputGroup size="sm">
                    <InputLeftAddon>%</InputLeftAddon>
                    <Input
                      value={(safeValue.lumpSumRebates as LumpSumRebates).specialtyBrandPercentage}
                      onChange={(e) => handleLumpSumChange('specialtyBrandPercentage', e.target.value)}
                      placeholder="Enter percentage"
                    />
                  </InputGroup>
                </FormControl>
              </VStack>
            )}
            
            {/* Option 4: No rebates available */}
            <Radio value="noRebates">
              No rebates available for Incumbent
            </Radio>
          </Stack>
        </RadioGroup>
      </FormControl>
    </VStack>
  );
}