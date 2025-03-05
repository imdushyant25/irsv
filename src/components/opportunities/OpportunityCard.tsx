// File: src/components/opportunities/OpportunityCard.tsx
import { Box, Heading, Text, Badge, VStack, HStack } from '@chakra-ui/react';
import { Opportunity } from '../../types/opportunity';
import Link from 'next/link';

interface OpportunityCardProps {
  opportunity: Opportunity;
}

export function OpportunityCard({ opportunity }: OpportunityCardProps) {
  return (
    <Link href={`/opportunities/${opportunity.id}`}>
      <Box
        borderWidth="1px"
        borderRadius="lg"
        p={6}
        transition="all 0.2s"
        _hover={{ transform: 'translateY(-2px)', shadow: 'md' }}
        cursor="pointer"
      >
        <VStack align="stretch" spacing={4}>
          <HStack justify="space-between">
            <Heading size="md" noOfLines={1}>
              {opportunity.employer}
            </Heading>
            <Badge colorScheme={getStageColor(opportunity.stageName)}>
              {opportunity.stageName || 'New'}
            </Badge>
          </HStack>

          <Box>
            <Text fontSize="sm" color="gray.600">
              Opportunity ID: {opportunity.opportunityId}
            </Text>
            <Text fontSize="sm" color="gray.600">
              Product ID: {opportunity.productId}
            </Text>
          </Box>

          <Box>
            <Text fontSize="sm" color="gray.500">
              Owner: {opportunity.opportunityOwner || 'Unassigned'}
            </Text>
            <Text fontSize="sm" color="gray.500">
              Created: {new Date(opportunity.createdAt).toLocaleDateString()}
            </Text>
          </Box>
        </VStack>
      </Box>
    </Link>
  );
}

function getStageColor(stage: string | null): string {
  switch (stage) {
    case 'New':
      return 'blue';
    case 'In Progress':
      return 'green';
    case 'Review':
      return 'yellow';
    case 'Completed':
      return 'purple';
    default:
      return 'gray';
  }
}