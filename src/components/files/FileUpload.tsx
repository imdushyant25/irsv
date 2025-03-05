// File: src/components/files/FileUpload.tsx
'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Text,
  useToast,
  VStack,
  Progress,
  Icon
} from '@chakra-ui/react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';
import * as XLSX from 'xlsx';

const DEFAULT_PRODUCT_ID = 'IRSV';

interface FileUploadProps {
  opportunityId: string;
  onUploadComplete: (fileId: string) => void;
}

export function FileUpload({ opportunityId, onUploadComplete }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const toast = useToast();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    try {
      setUploading(true);
      setProgress(0);

      // First, read the Excel file to get headers
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { 
        type: 'buffer',
        cellDates: true,
        cellNF: true,
        cellText: true
      });
      
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const headers = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })[0] as string[];

      // Count total rows (excluding header)
      const totalRows = XLSX.utils.sheet_to_json(firstSheet).length;

      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('opportunityId', opportunityId);
      formData.append('productId', 'IRSV'); // make this configurable to support other products
      formData.append('headers', JSON.stringify(headers));
      formData.append('rowCount', totalRows.toString());

      // Upload the file
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      
      toast({
        title: 'Upload Successful',
        description: 'File has been uploaded and is ready for mapping',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      onUploadComplete(data.fileId);
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload file',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [opportunityId, onUploadComplete, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1,
    disabled: uploading
  });

  return (
    <VStack spacing={4} width="100%">
      <Box
        {...getRootProps()}
        w="100%"
        h="200px"
        borderWidth={2}
        borderRadius="lg"
        borderStyle="dashed"
        borderColor={isDragActive ? 'blue.500' : 'gray.200'}
        bg={isDragActive ? 'blue.50' : 'gray.50'}
        transition="all 0.2s"
        _hover={{ borderColor: 'blue.500', bg: 'blue.50' }}
        display="flex"
        alignItems="center"
        justifyContent="center"
        cursor={uploading ? 'not-allowed' : 'pointer'}
      >
        <input {...getInputProps()} />
        <VStack spacing={2}>
          <Icon as={UploadCloud} w={8} h={8} color="gray.500" />
          <Text textAlign="center" color="gray.600">
            {isDragActive
              ? 'Drop the Excel file here'
              : 'Drag & drop an Excel file here, or click to select'}
          </Text>
          <Text fontSize="sm" color="gray.500">
            Supports .xlsx and .xls files
          </Text>
        </VStack>
      </Box>

      {uploading && (
        <Box w="100%">
          <Progress size="sm" isIndeterminate colorScheme="blue" />
          <Text mt={2} fontSize="sm" color="gray.600" textAlign="center">
            Uploading file...
          </Text>
        </Box>
      )}
    </VStack>
  );
}