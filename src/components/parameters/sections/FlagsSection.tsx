// File: src/components/parameters/sections/FlagsSection.tsx

import React from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Heading,
  VStack,
  Switch,
  FormControl,
  FormLabel,
  Text,
} from '@chakra-ui/react';
import { FeatureFlags } from '@/types/parameters';

interface FlagsSectionProps {
  value: FeatureFlags;
  onChange: (value: FeatureFlags) => void;
}

export function FlagsSection({
  value,
  onChange
}: FlagsSectionProps) {
  const handleChange = (field: keyof FeatureFlags) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    onChange({
      ...value,
      [field]: e.target.checked
    });
  };

  const flags: Array<{
    key: keyof FeatureFlags;
    label: string;
    description: string;
  }> = [
    {
      key: 'mcap',
      label: 'MCAP',
      description: 'Maximum Cost Allowance Program'
    },
    {
      key: 'pap',
      label: 'PAP',
      description: 'Patient Assistance Program'
    },
    {
      key: 'ids',
      label: 'IDS',
      description: 'Integrated Delivery System'
    },
    {
      key: 'hans',
      label: 'HANS',
      description: 'Health Analytics Network System'
    }
  ];

  return (
    <Card>
      <CardHeader>
        <Heading size="md">Feature Flags</Heading>
      </CardHeader>
      <CardBody>
        <VStack spacing={4} align="stretch">
          {flags.map(({ key, label, description }) => (
            <FormControl key={key} display="flex" alignItems="flex-start">
              <Switch
                id={key}
                isChecked={value[key]}
                onChange={handleChange(key)}
                mr={3}
                mt={1}
              />
              <FormLabel htmlFor={key} mb={0}>
                <Text fontWeight="medium">{label}</Text>
                <Text fontSize="sm" color="gray.600">
                  {description}
                </Text>
              </FormLabel>
            </FormControl>
          ))}
        </VStack>
      </CardBody>
    </Card>
  );
}