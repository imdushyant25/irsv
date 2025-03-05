// File: src/app/opportunities/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Heading,
  Stack,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Spinner,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';

interface Opportunity {
  id: string;
  opportunityId: string;
  employer: string;
  stageName: string;
}

export default function OpportunitiesPage() {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOpportunities = async () => {
      try {
        const response = await fetch('/api/opportunities');
        if (!response.ok) {
          throw new Error('Failed to fetch opportunities');
        }
        const data = await response.json();
        console.log('Fetched opportunities:', data); // Debug log
        setOpportunities(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load opportunities');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOpportunities();
  }, []);

  const handleOpportunityClick = (opportunityId: string) => {
    console.log('Navigating to opportunity:', opportunityId); // Debug log
    if (!opportunityId) {
      console.error('Invalid opportunity ID');
      return;
    }
    router.push(`/opportunities/${opportunityId}`);
  };

  if (isLoading) {
    return (
      <Container maxW="container.xl" centerContent py={10}>
        <Spinner size="xl" />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxW="container.xl" py={10}>
        <Alert status="error">
          <AlertIcon />
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={10}>
      <Stack spacing={6}>
        <Heading>Opportunities</Heading>
        {opportunities.length === 0 ? (
          <Alert status="info">
            <AlertIcon />
            No opportunities found
          </Alert>
        ) : (
          <Table variant="simple">
            <Thead>
              <Tr>
                <Th>Employer</Th>
                <Th>Opportunity ID</Th>
                <Th>Stage</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {opportunities.map((opportunity) => (
                <Tr key={opportunity.id} cursor="pointer">
                  <Td>{opportunity.employer}</Td>
                  <Td>{opportunity.opportunityId}</Td>
                  <Td>{opportunity.stageName}</Td>
                  <Td>
                    <Button
                      size="sm"
                      onClick={() => handleOpportunityClick(opportunity.opportunityId)}
                    >
                      View Details
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Stack>
    </Container>
  );
}