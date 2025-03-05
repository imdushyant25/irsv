// File: src/components/parameters/sections/AdminFeesSection.tsx

import React from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Heading,
  VStack,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  Text,
} from '@chakra-ui/react';
import { AdminFees } from '@/types/parameters';

interface AdminFeesSectionProps {
  value: AdminFees;
  onChange: (value: AdminFees) => void;
}

export function AdminFeesSection({
  value,
  onChange
}: AdminFeesSectionProps) {
  const handleChange = (field: keyof AdminFees) => (valueString: string) => {
    // Pass the raw value without formatting to allow any precision
    onChange({
      ...value,
      [field]: valueString
    });
  };

  return (
    <Card>
      <CardHeader>
        <Heading size="md">Admin Fees</Heading>
      </CardHeader>
      <CardBody>
        <VStack spacing={4} align="stretch">
          <FormControl>
            <FormLabel>Per Claim Admin Fee</FormLabel>
            <NumberInput
              value={value.perClaim}
              onChange={handleChange('perClaim')}
              min={0}
              // Remove precision constraint to allow any decimal precision
              //placeholder="Enter per claim fee"
            >
              <NumberInputField />
            </NumberInput>
            <Text fontSize="sm" color="gray.600" mt={1}>
              Fee charged per processed claim
            </Text>
          </FormControl>

          <FormControl>
            <FormLabel>IlluminateRx Admin Fee</FormLabel>
            <NumberInput
              value={value.illuminateRx}
              onChange={handleChange('illuminateRx')}
              min={0}
              // Remove precision constraint to allow any decimal precision
              //placeholder="Enter IlluminateRx fee"
            >
              <NumberInputField />
            </NumberInput>
            <Text fontSize="sm" color="gray.600" mt={1}>
              Additional fee for IlluminateRx platform usage
            </Text>
          </FormControl>
        </VStack>
      </CardBody>
    </Card>
  );
}