// File: src/components/parameters/sections/FormularySection.tsx

import React from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Heading,
  FormControl,
  FormLabel,
  Select
} from '@chakra-ui/react';
import { SectionChangeHandler } from '../../../types/parameters';

interface FormularySectionProps {
  value: string;
  onChange: SectionChangeHandler<string>;
}

export function FormularySection({ value, onChange }: FormularySectionProps) {
  return (
    <Card>
      <CardHeader>
        <Heading size="md">Formulary Selection</Heading>
      </CardHeader>
      <CardBody>
        <FormControl>
          <FormLabel>Select Formulary</FormLabel>
          <Select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Select an option"
          >
            <option value="4th PBM Closed Formulary">4th PBM Closed Formulary</option>
            <option value="4th PBM Open Formulary">4th PBM Open Formulary</option>
          </Select>
        </FormControl>
      </CardBody>
    </Card>
  );
}