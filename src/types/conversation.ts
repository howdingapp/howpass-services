export interface AIRule {
  id: string;
  type: 'bilan' | 'activity';
  name: string;
  description: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityData {
  id: string;
  title: string;
  shortDescription?: string;
  longDescription?: string;
  type?: string;
  category?: string;
  practice?: {
    id: string;
    title: string;
    shortDescription?: string;
    longDescription?: string;
    categoryId?: string;
    familyId?: string;
  };
}

export interface ConversationContext {
  id: string;
  userId: string;
  type: 'bilan' | 'activity';
  startTime: string;
  lastActivity: string;
  messages: ChatMessage[];
  metadata: Record<string, any>;
  status: 'active' | 'completed' | 'expired';
  aiRules?: AIRule[];
  activityData?: ActivityData;
}

export interface ChatMessage {
  id: string;
  content: string;
  type: 'user' | 'bot';
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface StartConversationRequest {
  conversationId: string;
  userId: string;
  type: 'bilan' | 'activity';
  initialContext?: {
    aiRules?: AIRule[];
    activityData?: ActivityData;
    [key: string]: any;
  };
  aiResponseId?: string; // ID de l'entrée ai_response pré-créée
}

export interface StartConversationResponse {
  success: boolean;
  conversationId: string;
  expiresIn: number; // secondes
  context?: ConversationContext;
  error?: string;
}

export interface AddMessageRequest {
  content: string;
  type: 'user' | 'bot';
  metadata?: Record<string, any>;
  aiResponseId?: string; // ID de l'entrée ai_response pré-créée
}

export interface AddMessageResponse {
  success: boolean;
  messageId: string;
  context?: ConversationContext;
  error?: string;
}

export interface GetContextResponse {
  success: boolean;
  context?: ConversationContext;
  error?: string;
}

export interface GenerateSummaryRequest {
  aiResponseId?: string; // ID de l'entrée ai_response pré-créée
}

export interface GenerateSummaryResponse {
  success: boolean;
  message: string;
  jobId: string;
  estimatedTime: string;
  queuePosition?: number;
  cleanupScheduled: string;
  error?: string;
}

export interface ConversationStats {
  activeConversations: number;
  totalConversations: number;
  memoryUsage: number; // bytes
  timestamp: string;
}

/**
 * Interface pour la sortie structurée du résumé d'activité
 * Correspond au schéma ActivitySummaryJsonOutputSchema
 */
export interface ActivitySummaryOutput {
  shortDescription: string;
  longDescription: string;
  title: string;
  selectedKeywords: string[];
  benefits: string[];
  typicalSituations: string;
}
