// File: src/components/parameters/ParametersForm.tsx

import React, { useState, useEffect } from 'react';
import { VStack, Button, useToast } from '@chakra-ui/react';
import { FormularySection } from './sections/FormularySection';
import { PlanExclusionsSection } from './sections/PlanExclusionsSection';
import { DawPenaltiesSection } from './sections/DawPenaltiesSection';
import { RebatesSection } from './sections/RebatesSection';
import { AdminFeesSection } from './sections/AdminFeesSection';
import { FlagsSection } from './sections/FlagsSection';
import { CopayModelingSection } from './sections/CopayModelingSection';
import { GeneralInformation } from '@/types/parameters';
import { getDefaultGeneralInformation, validateGeneralInformation } from '@/utils/parameterUtils';

interface GeneralInformationFormProps {
  opportunityId: string;
  onSave: (generalInfo: GeneralInformation) => Promise<void>;
  initialGeneralInfo?: GeneralInformation;
}

export default function GeneralInformationForm({
  opportunityId,
  onSave,
  initialGeneralInfo
}: GeneralInformationFormProps) {
  const [generalInfo, setGeneralInfo] = useState<GeneralInformation>(getDefaultGeneralInformation());
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (initialGeneralInfo) {
      setGeneralInfo(initialGeneralInfo);
    }
  }, [initialGeneralInfo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateGeneralInformation(generalInfo)) {
      toast({
        title: 'Validation Error',
        description: 'Please check all required fields',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    setIsLoading(true);
    try {
      await onSave(generalInfo);
      toast({
        title: 'Success',
        description: 'General Information saved successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error saving General Information',
        description: error instanceof Error ? error.message : 'An error occurred',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack spacing={6} align="stretch">
        <FormularySection
          value={generalInfo.formulary}
          onChange={(value) => setGeneralInfo(prev => ({
            ...prev,
            formulary: value
          }))}
        />

        <PlanExclusionsSection
          value={generalInfo.planExclusions}
          onChange={(value) => setGeneralInfo(prev => ({
            ...prev,
            planExclusions: value
          }))}
        />

        <DawPenaltiesSection
          value={generalInfo.dawPenalties}
          onChange={(value) => setGeneralInfo(prev => ({
            ...prev,
            dawPenalties: value
          }))}
        />

        <RebatesSection
          value={generalInfo.rebates}
          onChange={(value) => setGeneralInfo(prev => ({
            ...prev,
            rebates: value
          }))}
        />

        <CopayModelingSection
          value={generalInfo.copayModeling}
          onChange={(value) => setGeneralInfo(prev => ({
            ...prev,
            copayModeling: value
          }))}
        />

        <AdminFeesSection
          value={generalInfo.adminFees}
          onChange={(value) => setGeneralInfo(prev => ({
            ...prev,
            adminFees: value
          }))}
        />

        <FlagsSection
          value={generalInfo.flags}
          onChange={(value) => setGeneralInfo(prev => ({
            ...prev,
            flags: value
          }))}
        />

        <Button
          type="submit"
          colorScheme="blue"
          isLoading={isLoading}
          loadingText="Saving..."
          size="lg"
        >
          Save General Information
        </Button>
      </VStack>
    </form>
  );
}