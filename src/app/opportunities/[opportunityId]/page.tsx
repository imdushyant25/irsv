// File: src/app/opportunities/[opportunityId]/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Container,
  Button,
  Spinner,
  Alert,
  AlertIcon,
  VStack,
  HStack,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
} from '@chakra-ui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import OpportunityTabs from './components/OpportunityTabs';
import OverviewTab from './components/tabs/OverviewTab';
import FilesTab from './components/tabs/FilesTab';
import GeneralInformationTab from './components/tabs/GeneralInformationTab';
import { Opportunity } from '@/types/opportunity';

export default function OpportunityDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.opportunityId) {
      setError('Invalid opportunity ID');
      setIsLoading(false);
      return;
    }

    fetchOpportunityData(params.opportunityId as string);
  }, [params?.opportunityId]);

  const fetchOpportunityData = async (id: string) => {
    try {
      const response = await fetch(`/api/opportunities/${id}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Opportunity not found');
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch opportunity details');
      }
      
      const data = await response.json();
      setOpportunity(data);
    } catch (err) {
      console.error('Error fetching opportunity:', err);
      setError(err instanceof Error ? err.message : 'Failed to load opportunity');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Container maxW="container.xl" centerContent py={10}>
        <Spinner size="xl" />
      </Container>
    );
  }

  if (error || !opportunity) {
    return (
      <Container maxW="container.xl" py={10}>
        <Alert status="error">
          <AlertIcon />
          {error || 'Opportunity data not available'}
        </Alert>
        <Button
          leftIcon={<ChevronLeft />}
          mt={4}
          onClick={() => router.push('/opportunities')}
        >
          Back to Opportunities
        </Button>
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between">
          <Breadcrumb
            spacing="8px"
            separator={<ChevronRight size={16} />}
          >
            <BreadcrumbItem>
              <BreadcrumbLink as={Link} href="/opportunities">
                Opportunities
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem isCurrentPage>
              <BreadcrumbLink>{opportunity.employer}</BreadcrumbLink>
            </BreadcrumbItem>
          </Breadcrumb>

          <Button
            leftIcon={<ChevronLeft />}
            variant="ghost"
            onClick={() => router.push('/opportunities')}
          >
            Back
          </Button>
        </HStack>

        <OpportunityTabs>
          <OverviewTab opportunity={opportunity} />
          <FilesTab opportunityId={opportunity.opportunityId} />
          <GeneralInformationTab opportunity={opportunity} />
        </OpportunityTabs>
      </VStack>
    </Container>
  );
}