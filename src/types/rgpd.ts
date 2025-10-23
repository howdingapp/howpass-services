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
  feedbacks: Array<{
    id: string;
    practitionerUserId: string;
    patientName?: string;
    patientEmail?: string;
    patientEmailValidated: boolean;
    rating: number;
    experienceQuality: string;
    communicationQuality: string;
    overallSatisfaction: string;
    additionalComments?: string;
    isAnonymous: boolean;
    createdAt: string;
    updatedAt: string;
    experience: any;
    feedbackType: string;
    feedbackVideos?: any;
    feedbackImages?: any;
    activityGuestId?: string;
    activityId?: string;
  }>;
  openMapData: Array<{
    id: string;
    userDataId: string;
    userId: string;
    specialties?: any;
    gpsLocation?: any;
    dominantFamilyId?: string;
    dominantFamilyName?: string;
    dominantColor?: string;
    createdAt: string;
    updatedAt: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: any;
    experience?: string;
    diplomas?: any;
    photoUrl?: string;
    titleProgression?: any;
    vectorSummary?: string;
    isActive: boolean;
  }>;
  rendezVous: Array<{
    id: string;
    date: string;
    hour: number;
    minute: number;
    activityId: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    participants: number;
    // Données de l'utilisateur dans ce rendez-vous
    userRendezVous?: {
      id: string;
      userId: string;
      status: string;
      createdAt: string;
      updatedAt: string;
      amountFromTreasure: number;
      participants: number;
      paymentStatus: string;
      howerAngelId?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      reductionType?: string;
    };
    // Tous les participants si l'utilisateur est le créateur de l'activité
    allParticipants?: Array<{
      id: string;
      userId: string;
      status: string;
      createdAt: string;
      updatedAt: string;
      amountFromTreasure: number;
      participants: number;
      paymentStatus: string;
      howerAngelId?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      reductionType?: string;
    }>;
  }>;
  treasureChest: {
    id: string;
    userId: string;
    balance: number;
    totalEarned: number;
    createdAt: string;
    blockedAmount: number;
    referrals: Array<{
      treasureChestId: string;
      referencedUserId: string;
      subscriptionType?: string;
      amount?: number;
      dateReferred: string;
      createdAt: string;
      amountOffered: number;
    }>;
  };
  userEvents: Array<{
    id: string;
    userId: string;
    phone?: string;
    title?: string;
    message: string;
    messageData?: any;
    redirectionUrl?: string;
    fcmToken?: string;
    status: string;
    archived: boolean;
    createdAt: string;
    updatedAt: string;
    failReason?: string;
  }>;
  userProfile: {
    id: string;
    userId: string;
    dataFolder?: string;
    firstName: string;
    lastName: string;
    email: string;
    customerId?: string;
    phone?: string;
    birthDate?: string;
    address?: {
      street?: string;
      city?: string;
      postalCode?: string;
      country?: string;
    };
    subscriptionType?: string;
    activeFormula?: string;
    stripeConnectAccountId?: string;
    status: string;
    profil: string;
    referralCode?: string;
    onboardingReferral?: string;
    onboardingDemandeDate?: string;
    specialties?: {
      choice: string[];
      created: string[];
    };
    experience?: string;
    diplomas?: Array<{
      ecole: string;
      annee: string;
      intitule: string;
      duree: string;
    }>;
    photoUrl?: string;
    titleProgression?: Array<{
      title: string;
      percent: number;
      category: string;
      started_at: string;
      updated_at: string;
    }>;
    fcmToken?: string;
    mapData?: {
      dominantFamilyId?: string;
    };
    howanaRecommandation?: string;
    typicalSituations?: string;
    preferences?: {
      email: boolean;
      push: boolean;
    };
    favourites?: Array<{
      id: string;
      type: string;
      addedAt: string;
    }>;
    statistics?: {
      rendezvousPraticien: number;
      rendezvousPraticienDone: number;
      userRendezVousPraticien: number;
      praticienRevenu: number;
      userRendezVousGuest: number;
    };
    createdAt: string;
    updatedAt: string;
    // Données de modification en attente
    pendingModificationData?: {
      id: string;
      userId: string;
      specialties?: any;
      experience?: string;
      diplomas?: any;
      typicalSituations?: string;
      status: string;
      requestedAt: string;
      reviewedAt?: string;
      reviewedBy?: string;
      reviewNotes?: string;
      createdAt: string;
      updatedAt: string;
    };
    // Rôle utilisateur
    role?: string;
  };
  metadata: {
    totalBilans: number;
    totalActivities: number;
    totalActivityRequestedModifications: number;
    totalAiResponses: number;
    totalHowanaConversations: number;
    totalDeliveries: number;
    totalEmails: number;
    totalFeedbacks: number;
    totalOpenMapData: number;
    totalRendezVous: number;
    totalTreasureChestReferrals: number;
    totalUserEvents: number;
    exportDate: string;
    dataSize: string;
  };
}

