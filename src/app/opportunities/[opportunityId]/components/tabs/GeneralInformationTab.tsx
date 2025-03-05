// File: src/app/opportunities/[opportunityId]/components/tabs/ParametersTab.tsx
'use client';

import React from 'react';
import { VStack, Box, Card, CardHeader, Heading } from '@chakra-ui/react';
import GeneralInformationForm from '@/components/parameters/GeneralInformationForm';
import { Opportunity } from '@/types/opportunity';

interface GeneralInformationTabProps {
  opportunity: Opportunity;
}

export default function GeneralInformationTab({ opportunity }: GeneralInformationTabProps) {
  const handleSaveGeneralInfo = async (generalInfo: any) => {
    try {
      const response = await fetch(`/api/opportunities/${opportunity.opportunityId}/general-information`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(generalInfo),
      });

      if (!response.ok) {
        throw new Error('Failed to save general information');
      }
    } catch (error) {
      throw error;
    }
  };

  return (
    <VStack spacing={6} align="stretch">
      <Card>
        <CardHeader>
          <Heading size="md">General Information</Heading>
        </CardHeader>
        <Box p={6}>
          <GeneralInformationForm
            opportunityId={opportunity.opportunityId}
            onSave={handleSaveGeneralInfo}
            initialGeneralInfo={opportunity.opportunityMetadata?.generalInformation}
          />
        </Box>
      </Card>
    </VStack>
  );
}