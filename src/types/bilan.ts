import {
  PracticeSearchResult,
  ActivitySearchResult,
  HowerAngelSearchResult
} from './search';

export interface BilanScores {
  principaux: {
    niveauEnergie: number;
    qualiteSommeil: number;
    confortPhysique: number;
    equilibreEmotionnel: number;
  };
  secondaires: {
    scorePeau: number;
    scoreOngles: number;
    scoreCheveux: number;
    scoreMemoire: number;
    scoreDigestion: number;
    scoreConcentration: number;
  };
}

export interface BilanAISummary {
  emotionalState?: string;
  currentNeeds?: string[];
  preferences?: string[];
  constraints?: string[];
  recommendations?: Array<{
    recommendedCategories?: string;
    recommendedActivities?: string;
    relevanceScore?: number;
    reasoning?: string;
    benefits?: string[];
  }>;
  nextSteps?: string[];
}

export interface BilanHowanaSummary {
  userProfile?: {
    emotionalState?: string;
    currentNeeds?: string[];
    preferences?: string[];
    constraints?: string[];
  };
  recommendations?: Array<{
    recommendedCategories?: string;
    recommendedActivities?: string;
    relevanceScore?: number;
    reasoning?: string;
    benefits?: string[];
  }>;
  nextSteps?: string[];
}

export interface BilanComplet {
  id: string;
  userId: string;
  confortPhysique: number;
  equilibreEmotionnel: number;
  qualiteSommeil: number;
  niveauEnergie: number;
  scorePeau: number;
  scoreConcentration: number;
  scoreMemoire: number;
  scoreCheveux: number;
  scoreOngles: number;
  scoreDigestion: number;
  douleurs?: string;
  notesPersonnelles?: string;
  resumeIa?: string;
  conversationContextId?: string;
  conversationSummary?: string;
  status: 'active' | 'completed' | 'archived';
  step: number;
  createdAt: string;
  updatedAt: string;
  scores: BilanScores;
  aiSummary?: BilanAISummary;
  howanaSummary?: BilanHowanaSummary;
}

/**
 * Type de chunk pour les questions de bilan
 */
export type BilanChunkType = 
  | "user_situation_chunk"
  | "symptome_chunk"
  | "with_benefit_chunk";

/**
 * Chunk typé extrait de la réponse de l'utilisateur
 */
export interface BilanChunk {
  type: BilanChunkType;
  text: string;
}

/**
 * Intent pour les questions de bilan
 */
export interface BilanQuestionIntent {
  type: "bilan_question";
  universContext: {
    chunks: BilanChunk[];
  };
}

/**
 * Structure d'une famille dans le bilan
 */
export interface BilanFamily {
  id: string;
  name: string;
  dominanceScore: number;
  dominancePercentage: number; // Pourcentage de dominance (0-100), somme de toutes les familles = 100%
  practicesCount: number;
  activitiesCount: number;
  howerAngelsCount: number;
  matchCount: number;
}

/**
 * Structure de bilanUniverContext (version avec propriétés optionnelles)
 */
export interface BilanUniverContext {
  families?: { info?: string; value?: BilanFamily[] };
  practices?: { info?: string; value?: PracticeSearchResult[] };
  activities?: { info?: string; value?: ActivitySearchResult[] };
  howerAngels?: { info?: string; value?: HowerAngelSearchResult[] };
  questionResponses?: { info?: string; value?: Array<{ question?: string; response: string }> };
  chunks?: { info?: string; value?: BilanChunk[] };
  computedAt?: string;
}

/**
 * Structure complète de bilanUniverContext (version avec propriétés requises)
 */
export interface BilanUniverContextComplete {
  families: {
    info: string;
    value: BilanFamily[];
  };
  practices: {
    info: string;
    value: PracticeSearchResult[];
  };
  activities: {
    info: string;
    value: ActivitySearchResult[];
  };
  howerAngels: {
    info: string;
    value: HowerAngelSearchResult[];
  };
  questionResponses: {
    info: string;
    value: Array<{ question: string; index: number; response: string }>;
  };
  chunks: {
    info: string;
    value: BilanChunk[];
  };
  computedAt?: string;
}

/**
 * Structure complète de globalIntentInfos pour le bilan
 */
export interface BilanGlobalIntentInfos {
  bilanUniverContext: BilanUniverContextComplete;
}