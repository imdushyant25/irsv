// File: src/components/claims/ClaimsSummary.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Heading,
  Text,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  VStack,
  HStack,
  Progress,
  Badge,
  Spinner,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ClaimsSummaryProps {
  fileId: string;
}

interface SummaryStats {
  totalClaims: number;
  validClaims: number;
  invalidClaims: number;
  warningClaims: number;
  processingStats: {
    processed: number;
    pending: number;
    failed: number;
  };
  validationTrends: Array<{
    date: string;
    valid: number;
    invalid: number;
    warning: number;
  }>;
  costSummary: {
    totalCost: number;
    averageCost: number;
    costDistribution: Array<{
      range: string;
      count: number;
    }>;
  };
}

export function ClaimsSummary({ fileId }: ClaimsSummaryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SummaryStats | null>(null);

  useEffect(() => {
    fetchSummaryData();
  }, [fileId]);

  const fetchSummaryData = async () => {
    try {
      const response = await fetch(`/api/files/${fileId}/claims/summary`);
      if (!response.ok) throw new Error('Failed to fetch summary data');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box textAlign="center" py={8}>
        <Spinner size="xl" />
      </Box>
    );
  }

  if (error || !stats) {
    return (
      <Alert status="error">
        <AlertIcon />
        {error || 'Failed to load summary data'}
      </Alert>
    );
  }

  const validationRate = (stats.validClaims / stats.totalClaims) * 100;
  const processingRate = (stats.processingStats.processed / stats.totalClaims) * 100;

  return (
    <VStack spacing={6} align="stretch">
      {/* Key Metrics */}
      <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={4}>
        <Card>
          <CardBody>
            <Stat>
              <StatLabel>Total Claims</StatLabel>
              <StatNumber>{stats.totalClaims.toLocaleString()}</StatNumber>
              <StatHelpText>
                In current file
              </StatHelpText>
            </Stat>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Stat>
              <StatLabel>Validation Rate</StatLabel>
              <StatNumber>{validationRate.toFixed(1)}%</StatNumber>
              <StatHelpText>
                <StatArrow type={validationRate > 80 ? 'increase' : 'decrease'} />
                {stats.validClaims} valid claims
              </StatHelpText>
            </Stat>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Stat>
              <StatLabel>Total Cost</StatLabel>
              <StatNumber>
                ${stats.costSummary.totalCost.toLocaleString()}
              </StatNumber>
              <StatHelpText>
                Avg: ${stats.costSummary.averageCost.toFixed(2)}
              </StatHelpText>
            </Stat>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Stat>
              <StatLabel>Failed Claims</StatLabel>
              <StatNumber>{stats.processingStats.failed}</StatNumber>
              <StatHelpText>
                Requiring attention
              </StatHelpText>
            </Stat>
          </CardBody>
        </Card>
      </SimpleGrid>

      {/* Validation Progress */}
      <Card>
        <CardHeader>
          <Heading size="md">Validation Status</Heading>
        </CardHeader>
        <CardBody>
          <VStack spacing={4} align="stretch">
            <HStack justify="space-between">
              <Text>Valid Claims</Text>
              <Badge colorScheme="green">{stats.validClaims}</Badge>
            </HStack>
            <Progress 
              value={(stats.validClaims / stats.totalClaims) * 100} 
              colorScheme="green" 
              size="sm"
            />

            <HStack justify="space-between">
              <Text>Claims with Warnings</Text>
              <Badge colorScheme="yellow">{stats.warningClaims}</Badge>
            </HStack>
            <Progress 
              value={(stats.warningClaims / stats.totalClaims) * 100} 
              colorScheme="yellow" 
              size="sm"
            />

            <HStack justify="space-between">
              <Text>Invalid Claims</Text>
              <Badge colorScheme="red">{stats.invalidClaims}</Badge>
            </HStack>
            <Progress 
              value={(stats.invalidClaims / stats.totalClaims) * 100} 
              colorScheme="red" 
              size="sm"
            />
          </VStack>
        </CardBody>
      </Card>

      {/* Validation Trends Chart */}
      <Card>
        <CardHeader>
          <Heading size="md">Validation Trends</Heading>
        </CardHeader>
        <CardBody>
          <Box height="300px">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.validationTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="valid" 
                  stroke="#48BB78" 
                  name="Valid"
                />
                <Line 
                  type="monotone" 
                  dataKey="warning" 
                  stroke="#ECC94B" 
                  name="Warnings"
                />
                <Line 
                  type="monotone" 
                  dataKey="invalid" 
                  stroke="#F56565" 
                  name="Invalid"
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </CardBody>
      </Card>

      {/* Processing Summary */}
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
        <Card>
          <CardHeader>
            <Heading size="md">Processing Status</Heading>
          </CardHeader>
          <CardBody>
            <VStack spacing={4} align="stretch">
              <HStack justify="space-between">
                <Text>Processed</Text>
                <Badge colorScheme="green">
                  {stats.processingStats.processed}
                </Badge>
              </HStack>
              <HStack justify="space-between">
                <Text>Pending</Text>
                <Badge colorScheme="yellow">
                  {stats.processingStats.pending}
                </Badge>
              </HStack>
              <HStack justify="space-between">
                <Text>Failed</Text>
                <Badge colorScheme="red">
                  {stats.processingStats.failed}
                </Badge>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <Heading size="md">Cost Distribution</Heading>
          </CardHeader>
          <CardBody>
            <VStack spacing={4} align="stretch">
              {stats.costSummary.costDistribution.map((range) => (
                <HStack key={range.range} justify="space-between">
                  <Text>{range.range}</Text>
                  <Badge>{range.count}</Badge>
                </HStack>
              ))}
            </VStack>
          </CardBody>
        </Card>
      </SimpleGrid>
    </VStack>
  );
}