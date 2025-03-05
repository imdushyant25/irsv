// File: src/components/parameters/sections/PlanExclusionsSection.tsx

import React from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Heading,
  Stack,
  Checkbox,
  Tooltip,
} from '@chakra-ui/react';
import { PlanExclusions } from '@/types/parameters';

interface PlanExclusionsSectionProps {
  value: PlanExclusions;
  onChange: (value: PlanExclusions) => void;
}

export function PlanExclusionsSection({
  value,
  onChange
}: PlanExclusionsSectionProps) {
  const handleChange = (field: keyof PlanExclusions) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    onChange({
      ...value,
      [field]: e.target.checked
    });
  };

  const exclusionFields: Array<{
    key: keyof PlanExclusions;
    label: string;
    tooltip?: string;
  }> = [
    {
      key: 'lcvWowExclusions',
      label: 'LCV/WOW Exclusions',
    },
    {
      key: 'medicalBenefitsExclusions',
      label: 'Medical Benefits Exclusions'
    },
    {
      key: 'desiDrugs',
      label: 'DESI Drugs',
    },
    {
      key: 'otcDrugs',
      label: 'Over-the-Counter Drugs',
    },
    {
      key: 'compoundedMedications',
      label: 'Compounded Medications',
    },
    {
      key: 'abortifacients',
      label: 'Abortifacients',
    },
    {
      key: 'glp1Weightloss',
      label: 'GLP1 Weight Loss + Inj',
    },
    {
      key: 'weightlossNonGlp1',
      label: 'Weight Loss (non-GLP1 / All Others)',
    },
    {
      key: 'fertility',
      label: 'Fertility',
    },
    {
      key: 'growthHormone',
      label: 'Growth Hormone',
    },
    {
      key: 'questionableClinicalEffectiveness',
      label: 'Questionable Clinical Effectiveness',
    }
    // Add other exclusions
  ];

  return (
    <Card>
      <CardHeader>
        <Heading size="md">Plan Exclusions</Heading>
      </CardHeader>
      <CardBody>
        <Stack spacing={3}>
          {exclusionFields.map(({ key, label, tooltip }) => (
            <Tooltip key={key} label={tooltip} isDisabled={!tooltip}>
              <Checkbox
                isChecked={value[key]}
                onChange={handleChange(key)}
                isDisabled={key === 'lcvWowExclusions'} // Always enabled
              >
                {label}
              </Checkbox>
            </Tooltip>
          ))}
        </Stack>
      </CardBody>
    </Card>
  );
}