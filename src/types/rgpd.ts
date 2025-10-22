export interface RgpdRequest {
  id: string;
  userId: string;
  requestType: 'data_export' | 'data_deletion' | 'data_portability';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  email: string;
  requestedAt: string;
  processedAt?: string;
  errorMessage?: string;
  downloadUrl?: string;
}

export interface UserDataExport {
  userId: string;
  personalInfo: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    createdAt: string;
    updatedAt: string;
  };
  conversations: Array<{
    id: string;
    title?: string;
    createdAt: string;
    updatedAt: string;
    messages: Array<{
      id: string;
      content: string;
      messageType: string;
      createdAt: string;
    }>;
  }>;
  videos: Array<{
    id: string;
    title?: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    filePath: string;
    duration?: number;
  }>;
  images: Array<{
    id: string;
    title?: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    filePath: string;
  }>;
  sounds: Array<{
    id: string;
    title?: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    filePath: string;
    duration?: number;
  }>;
  bilans: Array<{
    id: string;
    title?: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  }>;
  metadata: {
    totalConversations: number;
    totalVideos: number;
    totalImages: number;
    totalSounds: number;
    totalBilans: number;
    exportDate: string;
    dataSize: string;
  };
}

export interface RgpdEmailData {
  to: string;
  subject: string;
  htmlContent: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

export interface RgpdApiResponse {
  success: boolean;
  message: string;
  requestId?: string;
  downloadUrl?: string;
  error?: string;
}

export interface RgpdJobPayload {
  requestId: string;
  userId: string;
  requestType: 'data_export' | 'data_deletion' | 'data_portability';
  email: string;
  metadata?: {
    webhookSource?: string;
    requestTimestamp?: string;
    priority?: 'low' | 'medium' | 'high';
  };
}

export interface RgpdJobResult {
  success: boolean;
  requestId: string;
  userId: string;
  requestType: 'data_export' | 'data_deletion' | 'data_portability';
  downloadUrl?: string;
  error?: string;
  processedAt: string;
  dataSize?: string;
}

