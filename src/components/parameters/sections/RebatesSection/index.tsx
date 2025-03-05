// File: src/components/parameters/sections/RebatesSection/index.tsx

import React from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Heading,
  VStack,
  Divider,
} from '@chakra-ui/react';
import { FourthPBMRebates } from './FourthPBMRebates';
import { IncumbentRebates } from './IncumbentRebates';
import type { RebatesParameters } from '@/types/parameters';

interface RebatesSectionProps {
  value: RebatesParameters;
  onChange: (value: RebatesParameters) => void;
}

export function RebatesSection({ value, onChange }: RebatesSectionProps) {
  return (
    <Card>
      <CardHeader>
        <Heading size="md">Rebates Configuration</Heading>
      </CardHeader>
      <CardBody>
        <VStack spacing={8} align="stretch">
          {/* Incumbent Rebates Section */}
          <IncumbentRebates
            value={value.incumbent}
            onChange={(incumbentValue) => onChange({
              ...value,
              incumbent: incumbentValue
            })}
          />
          
          <Divider />
          
          {/* 4th PBM Rebates Section */}
          <FourthPBMRebates
            value={value.fourthPbm}
            onChange={(fourthPbmValue) => onChange({
              ...value,
              fourthPbm: fourthPbmValue
            })}
          />
        </VStack>
      </CardBody>
    </Card>
  );
}

// Also export the sub-components for direct access if needed
export { FourthPBMRebates } from './FourthPBMRebates';
export { IncumbentRebates } from './IncumbentRebates';

// Default export for the main component
export default RebatesSection;