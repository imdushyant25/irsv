// File: src/components/guards/FileStatusGuard.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Spinner, Alert, AlertIcon, AlertTitle, AlertDescription } from '@chakra-ui/react';
import { FileStatus } from '@/types/file';

interface FileStatusGuardProps {
  fileId: string;
  status: FileStatus;
  opportunityId: string;
  children: React.ReactNode;
  allowedStatuses: FileStatus[];
  redirectPath?: string;
}

export default function FileStatusGuard({
  fileId,
  status,
  opportunityId,
  children,
  allowedStatuses,
  redirectPath
}: FileStatusGuardProps) {
  const router = useRouter();

  useEffect(() => {
    if (!allowedStatuses.includes(status)) {
      // If a redirect path is provided, use it; otherwise construct the claims view path
      const path = redirectPath || `/opportunities/${opportunityId}/files/${fileId}/claims`;
      router.push(path);
    }
  }, [status, allowedStatuses, opportunityId, fileId, redirectPath, router]);

  // If status is not allowed, show a message briefly before redirect
  if (!allowedStatuses.includes(status)) {
    return (
      <Box p={8}>
        <Alert
          status="info"
          variant="subtle"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          textAlign="center"
          height="200px"
        >
          <AlertIcon boxSize="40px" mr={0} />
          <AlertTitle mt={4} mb={1} fontSize="lg">
            Access Restricted
          </AlertTitle>
          <AlertDescription maxWidth="sm">
            This file has been processed and is no longer available for mapping.
            Redirecting to claims view...
          </AlertDescription>
          <Spinner mt={4} />
        </Alert>
      </Box>
    );
  }

  // If status is allowed, render children
  return <>{children}</>;
}