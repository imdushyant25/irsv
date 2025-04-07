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
      key: 'lcv_wow',
      label: 'LCV/WOW Exclusions',
    },
    {
      key: 'medical_benefit_only',
      label: 'Medical Benefits Exclusions'
    },
    {
      key: 'desi',
      label: 'DESI Drugs',
    },
    {
      key: 'otc_drug_ind',
      label: 'Over-the-Counter Drugs',
    },
    {
      key: 'abortifacient',
      label: 'Abortifacients',
    },
    {
      key: 'weight_loss_inj',
      label: 'GLP1 Weight Loss + Inj',
    },
    {
      key: 'weight_loss_oral',
      label: 'Weight Loss (non-GLP1 / All Others)',
    },
    {
      key: 'fertility',
      label: 'Fertility',
    },
    {
      key: 'growth_hormone',
      label: 'Growth Hormone',
    },
    {
      key: 'questionable_clinical_effectiveness',
      label: 'Questionable Clinical Effectiveness',
    }
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
                isDisabled={key === 'lcv_wow'} // Always enabled
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