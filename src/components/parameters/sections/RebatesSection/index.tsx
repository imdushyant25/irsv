// File: src/components/parameters/sections/RebatesSection/index.tsx

import React from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Heading,
  VStack,
} from '@chakra-ui/react';
import { IncumbentRebates } from './IncumbentRebates';
import type { RebatesParameters, PerClaimRebates, LumpSumRebates } from '@/types/parameters';

interface RebatesSectionProps {
  value: RebatesParameters;
  onChange: (value: RebatesParameters) => void;
}

export function RebatesSection({ value, onChange }: RebatesSectionProps) {
  // Default rebate structures
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

  // Ensure we have a safe value with all required fields
  const safeValue: RebatesParameters = {
    incumbent: {
      type: value?.incumbent?.type || 'useFromClaims',
      perClaimRebates: value?.incumbent?.perClaimRebates ? 
        { ...defaultPerClaimRebates, ...value.incumbent.perClaimRebates } : 
        defaultPerClaimRebates,
      lumpSumRebates: value?.incumbent?.lumpSumRebates ? 
        { ...defaultLumpSumRebates, ...value.incumbent.lumpSumRebates } : 
        defaultLumpSumRebates
    },
    fourthPbm: {
      type: value?.fourthPbm?.type || 'useFromClaims',
      perClaimRebates: value?.fourthPbm?.perClaimRebates ? 
        { ...defaultPerClaimRebates, ...value.fourthPbm.perClaimRebates } : 
        defaultPerClaimRebates,
      lumpSumRebates: value?.fourthPbm?.lumpSumRebates ? 
        { ...defaultLumpSumRebates, ...value.fourthPbm.lumpSumRebates } : 
        defaultLumpSumRebates
    }
  };

  return (
    <Card>
      <CardHeader>
        <Heading size="md">Rebates Configuration</Heading>
      </CardHeader>
      <CardBody>
        <VStack spacing={8} align="stretch">
          {/* Incumbent Rebates Section */}
          <IncumbentRebates
            value={safeValue.incumbent}
            onChange={(incumbentValue) => {
              onChange({
                ...safeValue,
                incumbent: incumbentValue
              });
            }}
          />
        </VStack>
      </CardBody>
    </Card>
  );
}

// Also export the sub-components for direct access if needed
export { IncumbentRebates } from './IncumbentRebates';

// Default export for the main component
export default RebatesSection;