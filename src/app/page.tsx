// File: src/app/page.tsx
'use client';

import { Box, Container, Heading, Text, Button, VStack } from '@chakra-ui/react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <Container maxW="container.xl" py={10}>
      <VStack spacing={8} align="center" textAlign="center">
        <Heading size="2xl">
          Pharmacy Benefits Claims Processing Platform
        </Heading>
        
        <Text fontSize="xl" color="gray.600">
          Streamline your pharmacy benefits claims processing with our comprehensive platform
        </Text>

        <Box py={6}>
          <Link href="/opportunities" passHref>
            <Button colorScheme="blue" size="lg">
              View Opportunities
            </Button>
          </Link>
        </Box>
      </VStack>
    </Container>
  );
}