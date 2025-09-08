// Types des repository - Centralisation de tous les types de données métier

// ===== HOWANA CONVERSATION TYPES =====
export type HowanaConversationType = 'activity' | 'bilan' | 'recommandation';
export type HowanaConversationStatus = 'active' | 'completed' | 'expired';

export interface HowanaConversation {
  id: string;
  userId: string;
  activityId?: string;
  bilanId?: string;
  conversationType: HowanaConversationType;
  contextId: string;
  context?: HowanaContext;
  summary?: string;
  status: HowanaConversationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateHowanaConversationRequest {
  userId: string;
  activityId?: string;
  bilanId?: string;
  conversationType: HowanaConversationType;
  contextId: string;
  context?: HowanaContext;
  summary?: string;
  status?: HowanaConversationStatus;
}

export interface UpdateHowanaConversationRequest {
  id: string;
  context?: HowanaContext;
  summary?: string;
  status?: HowanaConversationStatus;
}

// ===== HOWANA CONTEXT TYPES =====
export interface HowanaActivityContext {
  type: 'activity';
  activityData: {
    id: string;
    title?: string;
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
  };
  practicienData: {
    creatorExperience?: string;
  };
  userData: {
    firstName?: string;
    lastName?: string;
    age?: number;
    experience?: string;
  };
  isEditing?: boolean;
}

export interface HowanaBilanContext {
  type: 'bilan';
  bilanData: {
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
    douleurs?: any;
    notesPersonnelles?: string;
    resumeIa?: string;
    step: number;
    status: string;
    updatedAt: string;
  };
  userData: {
    firstName?: string;
    lastName?: string;
    age?: number;
    experience?: string;
  };
  lastHowanaRecommandation?: HowanaRecommandation | null;
}

export interface HowanaRecommandationContext {
  type: 'recommandation';
  lastBilan?: {
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
    douleurs?: any;
    notesPersonnelles?: string;
    resumeIa?: string;
    step: number;
    status: string;
    updatedAt: string;
  };
  userData: {
    firstName?: string;
    lastName?: string;
    age?: number;
    experience?: string;
  };
  lastHowanaRecommandation?: HowanaRecommandation | null;
}

export type HowanaContext = (HowanaActivityContext | HowanaBilanContext | HowanaRecommandationContext) & {
  // Propriétés de base de la conversation
  id?: string;
  userId: string;
  startTime?: string;
  lastActivity?: string;
  status?: 'active' | 'completed' | 'archived';
  
  // Messages de la conversation (optionnel car géré séparément)
  messages?: Array<{
    id: string;
    content: string;
    type: 'user' | 'bot';
    timestamp: string;
    metadata?: any;
  }>;
  
  // Métadonnées pour le traitement IA
  previousCallId?: string;
  previousResponse?: string;
  recommendations?: {
    activities: any[];
    practices: any[];
  };
  hasRecommendations?: boolean;
  bilanId?: string;
  activityId?: string;
  
  // Métadonnées générales (pour compatibilité)
  metadata: {
    [key: string]: any;
  };

};

// ===== HOWANA RECOMMENDATION TYPES =====
export interface HowanaRecommandation {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  userProfile?: {
    supposedEmotionalState?: string;
    supposedCurrentNeeds?: string[];
    supposedPreferences?: string[];
    supposedConstraints?: string[];
  };
  recommendedCategories?: Array<{
    id: string;
    name: string;
  }>;
  recommendedActivities?: Array<{
    id: string;
    name: string;
  }>;
  activitiesReasons?: string;
  practicesReasons?: string;
  importanteKnowledge?: string[];
  relevanceScore?: number;
}

// ===== IA RULES TYPES =====
export interface IARule {
  id: string;
  type: 'bilan' | 'activity' | 'recommandation';
  name: string;
  description: string;
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
