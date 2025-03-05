// File: src/lib/aws/s3.ts
import { 
    S3Client, 
    PutObjectCommand, 
    GetObjectCommand 
  } from '@aws-sdk/client-s3';
  import { getSignedUrl as getAwsSignedUrl } from '@aws-sdk/s3-request-presigner';
  
  // Validate required environment variables
  const requiredEnvVars = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'AWS_S3_BUCKET'
  ];
  
  requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  });
  
  // Initialize S3 client
  const s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
    }
  });
  
  /**
   * Uploads a file to S3
   * @param file - File buffer to upload
   * @param key - S3 key (path + filename)
   * @param contentType - MIME type of the file
   * @returns Promise<string> - S3 location of the uploaded file
   */
  export const uploadToS3 = async (
    file: Buffer,
    key: string,
    contentType: string
  ): Promise<string> => {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: key,
          Body: file,
          ContentType: contentType
        })
      );
  
      return key;
    } catch (error) {
      console.error('Error uploading to S3:', error);
      throw new Error('Failed to upload file to S3');
    }
  };
  
  /**
   * Downloads a file from S3
   * @param key - S3 key of the file
   * @returns Promise<Buffer> - File content
   */
  export const downloadFromS3 = async (key: string): Promise<Buffer> => {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: key
        })
      );
  
      // Convert readable stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      console.error('Error downloading from S3:', error);
      throw new Error('Failed to download file from S3');
    }
  };
  
  /**
   * Generates a presigned URL for an S3 object
   * @param key - S3 key of the file
   * @param expiresIn - URL expiration time in seconds (default: 3600)
   * @returns Promise<string> - Presigned URL
   */
  export const getSignedUrl = async (
    key: string,
    expiresIn: number = 3600
  ): Promise<string> => {
    try {
      const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key
      });
      
      return await getAwsSignedUrl(s3Client, command, { expiresIn });
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw new Error('Failed to generate signed URL');
    }
  };