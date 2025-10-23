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

// Types pour l'export anonymisé
export interface AnonymizedUserDataExport {
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
    douleurs?: string;
    notesPersonnelles?: string;
    resumeIa?: string;
    conversationContextId?: string;
    conversationSummary?: string;
    status: string;
    step: number;
    scores?: any;
    aiSummary?: any;
    howanaSummary?: any;
  }>;
  activities: Array<{
    id: string;
    title?: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    status?: string;
    isActive?: boolean;
    durationMinutes?: number;
    participants?: number;
    rating?: number;
    price?: number;
    locationType?: string;
    typicalSituations?: string;
    presentationImageUrl?: string;
    presentationVideoUrl?: string;
    benefits?: any;
    selectedKeywords?: any;
    metadata?: any;
    statistics?: any;
    maxParticipantsByUser?: number;
  }>;
  activityRequestedModifications: Array<{
    id: string;
    activityId: string;
    title?: string;
    shortDescription?: string;
    longDescription?: string;
    presentationImageUrl?: string;
    presentationVideoUrl?: string;
    benefits?: any;
    practiceId?: string;
    price?: number;
    typicalSituations?: string;
    address?: any;
    selectedKeywords?: any;
    status: string;
    requestedAt: string;
    reviewedAt?: string;
    reviewedBy?: string;
    reviewNotes?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  practices: Array<{
    id: string;
    title?: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  userData: Array<{
    id: string;
    profile?: string;
    specialties?: any;
    experience?: string;
    typicalSituations?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  aiResponses: Array<{
    id: string;
    conversationId: string;
    responseText: string;
    messageType: string;
    createdAt: string;
    metadata?: any;
  }>;
  howanaConversations: Array<{
    id: string;
    context?: any;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  userRendezVous: Array<{
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  deliveries: Array<{
    id: string;
    deliveryType?: string;
    deliveryAddress?: any;
    deliveryReference?: string;
    createdAt: string;
    expectedAt: string;
    paymentIntentId?: string;
    status?: string;
    trackingNumber?: string;
    actualDeliveryDate?: string;
    isGift?: boolean;
    recipientFirstName?: string;
    recipientLastName?: string;
    recipientEmail?: string;
    recipientInfo?: any;
    personalMessage?: string;
    updatedAt?: string;
    giftAmount?: number;
    selectedFormula?: any;
    activationDate?: string;
    trackingType?: string;
    stripeSubscriptionSessionId?: string;
    transportCosts?: number;
    promotionId?: string;
  }>;
  emails: Array<{
    fromEmail: string;
    toEmails: string[];
    ccEmails?: string[];
    bccEmails?: string[];
    subject: string;
    template?: string;
    text?: string;
    replyTo?: string[];
    mapping?: any;
    tags?: any;
    headers?: any;
    status: string;
    failReason?: string;
    attempts: number;
    scheduledAt?: string;
    sentAt?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  metadata: {
    totalConversations: number;
    totalVideos: number;
    totalImages: number;
    totalSounds: number;
    totalBilans: number;
    totalActivities: number;
    totalActivityRequestedModifications: number;
    totalPractices: number;
    totalUserData: number;
    totalAiResponses: number;
    totalHowanaConversations: number;
    totalUserRendezVous: number;
    totalDeliveries: number;
    totalEmails: number;
    exportDate: string;
    dataSize: string;
  };
}

