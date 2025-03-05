import React from 'react';
import {
  VStack,
  Grid,
  GridItem,
  Text,
  Badge,
  Box,
  Heading,
  Card,
  CardHeader,
  CardBody,
  HStack,
  Divider
} from '@chakra-ui/react';
import { formatDate } from '@/utils/format';
import { Opportunity } from '@/types/opportunity';

interface OverviewTabProps {
  opportunity: Opportunity;
}

export default function OverviewTab({ opportunity }: OverviewTabProps) {
  return (
    <VStack spacing={6} align="stretch">
      {/* Header Section */}
      <Card>
        <CardHeader pb={2}>
          <HStack justify="space-between" align="start">
            <Box>
              <Heading size="lg">{opportunity.employer}</Heading>
              <Text color="gray.600" mt={1}>
                Opportunity ID: {opportunity.opportunityId}
              </Text>
            </Box>
            <Badge 
              colorScheme={getStageColor(opportunity.stageName)}
              px={3} 
              py={1} 
              borderRadius="full"
            >
              {opportunity.stageName || 'New'}
            </Badge>
          </HStack>
        </CardHeader>
        <CardBody pt={2}>
          <Text color="gray.600">
            Product ID: {opportunity.productId}
          </Text>
        </CardBody>
      </Card>

      {/* Details Grid */}
      <Grid 
        templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} 
        gap={6}
      >
        {/* Team Information */}
        <GridItem>
          <Card>
            <CardHeader>
              <Heading size="md">Team</Heading>
            </CardHeader>
            <CardBody>
              <VStack align="stretch" spacing={4}>
                <Box>
                  <Text fontWeight="medium">Opportunity Owner</Text>
                  <Text>{opportunity.opportunityOwner || 'Unassigned'}</Text>
                </Box>
                <Box>
                  <Text fontWeight="medium">Financial Analyst</Text>
                  <Text>{opportunity.financialAnalyst || 'Unassigned'}</Text>
                </Box>
                <Box>
                  <Text fontWeight="medium">Strategic Pharmacy Analyst</Text>
                  <Text>{opportunity.strategicPharmacyAnalyst || 'Unassigned'}</Text>
                </Box>
              </VStack>
            </CardBody>
          </Card>
        </GridItem>

        {/* Timeline/Activity */}
        <GridItem>
          <Card>
            <CardHeader>
              <Heading size="md">Activity</Heading>
            </CardHeader>
            <CardBody>
              <VStack align="stretch" spacing={4}>
                <Box>
                  <Text fontWeight="medium">Created</Text>
                  <Text>{formatDate(opportunity.createdAt)}</Text>
                  <Text fontSize="sm" color="gray.600">
                    by {opportunity.createdBy}
                  </Text>
                </Box>
                {opportunity.updatedAt && (
                  <Box>
                    <Text fontWeight="medium">Last Updated</Text>
                    <Text>{formatDate(opportunity.updatedAt)}</Text>
                    <Text fontSize="sm" color="gray.600">
                      by {opportunity.updatedBy}
                    </Text>
                  </Box>
                )}
              </VStack>
            </CardBody>
          </Card>
        </GridItem>
      </Grid>
    </VStack>
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