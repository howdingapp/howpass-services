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
