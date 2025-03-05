// File: src/components/common/Pagination.tsx
import { HStack, Button, Text } from '@chakra-ui/react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ 
  currentPage, 
  totalPages, 
  onPageChange 
}: PaginationProps) {
  return (
    <HStack spacing={2} justify="center">
      <Button
        onClick={() => onPageChange(currentPage - 1)}
        isDisabled={currentPage === 1}
        size="sm"
      >
        Previous
      </Button>
      
      <Text>
        Page {currentPage} of {totalPages}
      </Text>
      
      <Button
        onClick={() => onPageChange(currentPage + 1)}
        isDisabled={currentPage === totalPages}
        size="sm"
      >
        Next
      </Button>
    </HStack>
  );
}