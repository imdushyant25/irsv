// File: src/components/parameters/sections/CopayModelingSection.tsx

import React from 'react';
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
  SimpleGrid
} from '@chakra-ui/react';
import { CopayModelingParameters } from '@/types/parameters';

const DEFAULT_ILLUMINATE_VALUES = {
  retail30Generic: '30% max $ 150',
  retail30Brand: '30% max $ 150',
  retail90Generic: '30% max $ 450',
  retail90Brand: '30% max $ 450',
  mailGeneric: '30% max $ 450',
  mailBrand: '30% max $ 450',
  specialtyBrand: '30% max $ 1000'
};

const DEFAULT_USER_DEFINED = {
  retail30Generic: '',
  retail30PreferredBrand: '',
  retail30NonPreferredBrand: '',
  retail90Generic: '',
  retail90PreferredBrand: '',
  retail90NonPreferredBrand: '',
  mailGeneric: '',
  mailPreferredBrand: '',
  mailNonPreferredBrand: '',
  specialtyGeneric: '',
  specialtyPreferredBrand: '',
  specialtyNonPreferredBrand: ''
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
  const modelingType = value?.modelingType || 'userDefined';

  // Handle radio button change
  const handleTypeChange = (newType: 'userDefined' | 'illuminateRxStandards') => {
    let newValue: CopayModelingParameters;

    if (newType === 'userDefined') {
      newValue = {
        modelingType: newType,
        userDefined: value?.userDefined || DEFAULT_USER_DEFINED,
        illuminateRxStandards: undefined
      };
    } else {
      newValue = {
        modelingType: newType,
        userDefined: undefined,
        illuminateRxStandards: value?.illuminateRxStandards || DEFAULT_ILLUMINATE_VALUES
      };
    }

    onChange(newValue);
  };

  // Handle user defined field changes
  const handleUserDefinedChange = (field: keyof typeof DEFAULT_USER_DEFINED) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    onChange({
      ...value,
      modelingType: 'userDefined',
      userDefined: {
        ...(value?.userDefined || DEFAULT_USER_DEFINED),
        [field]: e.target.value
      }
    });
  };

  // Handle illuminate rx standards field changes
  const handleIlluminateChange = (field: keyof typeof DEFAULT_ILLUMINATE_VALUES) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    onChange({
      ...value,
      modelingType: 'illuminateRxStandards',
      illuminateRxStandards: {
        ...(value?.illuminateRxStandards || DEFAULT_ILLUMINATE_VALUES),
        [field]: e.target.value
      }
    });
  };

  // Get current values with defaults
  const userDefinedValues = value?.userDefined || DEFAULT_USER_DEFINED;
  const illuminateValues = value?.illuminateRxStandards || DEFAULT_ILLUMINATE_VALUES;

  return (
    <Card>
      <CardHeader>
        <Heading size="md">Copay (CoInsurance) Modeling</Heading>
      </CardHeader>
      <CardBody>
        <VStack spacing={6} align="stretch">
          <RadioGroup value={modelingType} onChange={handleTypeChange}>
            <Stack direction="column" spacing={4}>
              <Radio value="userDefined">
                <Text fontWeight="medium">Option 1: User Defined Amounts</Text>
              </Radio>
              
              <Radio value="illuminateRxStandards">
                <Text fontWeight="medium">Option 2: IlluminateRx Standards</Text>
              </Radio>
            </Stack>
          </RadioGroup>

          {modelingType === 'userDefined' && (
            <VStack spacing={4} pt={4}>
              <Text fontWeight="medium" alignSelf="flex-start">User Defined Amounts</Text>
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} width="full">
                <FormControl>
                  <FormLabel>Retail-30 Generic</FormLabel>
                  <Input 
                    value={userDefinedValues.retail30Generic} 
                    onChange={handleUserDefinedChange('retail30Generic')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Retail-30 Preferred Brand</FormLabel>
                  <Input 
                    value={userDefinedValues.retail30PreferredBrand} 
                    onChange={handleUserDefinedChange('retail30PreferredBrand')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Retail-30 Non-Preferred Brand</FormLabel>
                  <Input 
                    value={userDefinedValues.retail30NonPreferredBrand} 
                    onChange={handleUserDefinedChange('retail30NonPreferredBrand')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Retail-90 Generic</FormLabel>
                  <Input 
                    value={userDefinedValues.retail90Generic} 
                    onChange={handleUserDefinedChange('retail90Generic')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Retail-90 Preferred Brand</FormLabel>
                  <Input 
                    value={userDefinedValues.retail90PreferredBrand} 
                    onChange={handleUserDefinedChange('retail90PreferredBrand')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Retail-90 Non-Preferred Brand</FormLabel>
                  <Input 
                    value={userDefinedValues.retail90NonPreferredBrand} 
                    onChange={handleUserDefinedChange('retail90NonPreferredBrand')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Mail Generic</FormLabel>
                  <Input 
                    value={userDefinedValues.mailGeneric} 
                    onChange={handleUserDefinedChange('mailGeneric')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Mail Preferred Brand</FormLabel>
                  <Input 
                    value={userDefinedValues.mailPreferredBrand} 
                    onChange={handleUserDefinedChange('mailPreferredBrand')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Mail Non-Preferred Brand</FormLabel>
                  <Input 
                    value={userDefinedValues.mailNonPreferredBrand} 
                    onChange={handleUserDefinedChange('mailNonPreferredBrand')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Specialty Generic</FormLabel>
                  <Input 
                    value={userDefinedValues.specialtyGeneric} 
                    onChange={handleUserDefinedChange('specialtyGeneric')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Specialty Preferred Brand</FormLabel>
                  <Input 
                    value={userDefinedValues.specialtyPreferredBrand} 
                    onChange={handleUserDefinedChange('specialtyPreferredBrand')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Specialty Non-Preferred Brand</FormLabel>
                  <Input 
                    value={userDefinedValues.specialtyNonPreferredBrand} 
                    onChange={handleUserDefinedChange('specialtyNonPreferredBrand')} 
                  />
                </FormControl>
              </SimpleGrid>
            </VStack>
          )}

          {modelingType === 'illuminateRxStandards' && (
            <VStack spacing={4} pt={4}>
              <Text fontWeight="medium" alignSelf="flex-start">IlluminateRx Standards</Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} width="full">
                <FormControl>
                  <FormLabel>Retail-30 Generic</FormLabel>
                  <Input 
                    value={illuminateValues.retail30Generic} 
                    onChange={handleIlluminateChange('retail30Generic')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Retail-30 Brand</FormLabel>
                  <Input 
                    value={illuminateValues.retail30Brand} 
                    onChange={handleIlluminateChange('retail30Brand')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Retail-90 Generic</FormLabel>
                  <Input 
                    value={illuminateValues.retail90Generic} 
                    onChange={handleIlluminateChange('retail90Generic')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Retail-90 Brand</FormLabel>
                  <Input 
                    value={illuminateValues.retail90Brand} 
                    onChange={handleIlluminateChange('retail90Brand')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Mail Generic</FormLabel>
                  <Input 
                    value={illuminateValues.mailGeneric} 
                    onChange={handleIlluminateChange('mailGeneric')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Mail Brand</FormLabel>
                  <Input 
                    value={illuminateValues.mailBrand} 
                    onChange={handleIlluminateChange('mailBrand')} 
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Specialty Brand</FormLabel>
                  <Input 
                    value={illuminateValues.specialtyBrand} 
                    onChange={handleIlluminateChange('specialtyBrand')} 
                  />
                </FormControl>
              </SimpleGrid>
            </VStack>
          )}
        </VStack>
      </CardBody>
    </Card>
  );
}