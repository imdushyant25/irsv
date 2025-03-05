// File: src/components/parameters/sections/DawPenaltiesSection.tsx

import React from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Heading,
  VStack,
  Checkbox,
  Text,
  FormControl,
  FormLabel,
} from '@chakra-ui/react';

// Update the type definition to be an object with boolean flags
export interface DawPenalties {
  daw1: boolean;
  daw2: boolean;
}

interface DawPenaltiesSectionProps {
  value: DawPenalties;
  onChange: (value: DawPenalties) => void;
}

export function DawPenaltiesSection({
  value,
  onChange
}: DawPenaltiesSectionProps) {

  const safeValue: DawPenalties = {
    daw1: Boolean(value?.daw1),
    daw2: Boolean(value?.daw2)
  };
  
  const handleChange = (field: keyof DawPenalties) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    // Create a new clean object with only the expected properties
    const newValue: DawPenalties = {
      ...safeValue,
      [field]: e.target.checked
    };
    onChange(newValue);
  };

  return (
    <Card>
      <CardHeader>
        <Heading size="md">DAW Penalties</Heading>
      </CardHeader>
      <CardBody>
        <VStack spacing={4} align="stretch">
          <FormControl>
            <FormLabel fontWeight="medium">Select applicable penalties:</FormLabel>
            
            <VStack spacing={3} align="start" pl={2}>
              <Checkbox
                isChecked={safeValue.daw1}
                onChange={handleChange('daw1')}
              >
                <Text fontWeight="medium">Dispense-as-Written (DAW) 1</Text>
              </Checkbox>
              
              <Checkbox
                isChecked={safeValue.daw2}
                onChange={handleChange('daw2')}
              >
                <Text fontWeight="medium">Dispense-as-Written (DAW) 2</Text>
              </Checkbox>
            </VStack>
          </FormControl>
        </VStack>
      </CardBody>
    </Card>
  );
}