import { BilanComplet } from './bilan';

export interface AIRule {
  id: string;
  name: string;
  description: string;
  type: 'activity' | 'recommandation' | 'bilan';
  priority: number;
  isActive: boolean;
}

export interface ActivityData {
  id: string;
  title: string;
  shortDescription?: string;
  longDescription?: string;
  selectedKeywords?: string[];
  benefits?: string[];
  typicalSituations?: string;
  practice?: {
    id: string;
    title: string;
    shortDescription?: string;
    longDescription?: string;
    categoryData?: {
      id: string;
      name: string;
      description?: string;
    };
    familyData?: {
      id: string;
      name: string;
      description?: string;
    };
  };
}

export interface BilanData {
  id: string;
  scores: {
    principaux: {
      confortPhysique: number;
      equilibreEmotionnel: number;
      qualiteSommeil: number;
      niveauEnergie: number;
    };
    secondaires: {
      scorePeau: number;
      scoreConcentration: number;
      scoreMemoire: number;
      scoreCheveux: number;
      scoreOngles: number;
      scoreDigestion: number;
    };
  };
  douleurs?: string;
  notesPersonnelles?: string;
  resumeIa?: string;
  step: number;
  status: string;
}

export interface ConversationContext {
  id: string;
  userId: string;
  type: 'bilan' | 'activity' | 'recommandation';
  startTime: string;
  lastActivity: string;
  messages: Array<{
    id: string;
    content: string;
    type: 'user' | 'bot';
    timestamp: string;
    metadata?: Record<string, any>;
  }>;
  metadata: Record<string, any>;
  status: 'active' | 'completed' | 'archived';
  aiRules?: AIRule[];
  activityData?: ActivityData;
  bilanData?: BilanData;
  lastBilan?: BilanComplet;
  // Propriétés ajoutées pour harmoniser avec la webapp
  practicienData?: {
    creatorExperience?: string;
  };
  isEditing?: boolean;
  userData?: {
    firstName?: string;
    lastName?: string;
    age?: number;
    experience?: string;
  };
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
  type: 'bilan' | 'activity' | 'recommandation';
  initialContext?: Partial<ConversationContext>;
  aiResponseId?: string;
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
  aiResponseId?: string;
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

// Interface pour la description des outils OpenAI
export interface OpenAITool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  strict: boolean;
}

export interface OpenAIToolsDescription {
  tools: OpenAITool[];
}
