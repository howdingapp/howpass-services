export interface BilanRequest {
  userId: string;
  userState: string; // Description de l'état de l'utilisateur
  context?: {
    previousActivities?: string[];
    preferences?: string[];
    goals?: string[];
    [key: string]: any;
  };
}

export interface BilanResponse {
  success: boolean;
  recommendations: ActivityRecommendation[];
  analysis: UserStateAnalysis;
  suggestions: string[];
  error?: string;
}

export interface ActivityRecommendation {
  id: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  category: string;
  practice: {
    id: string;
    title: string;
    description: string;
  };
  relevanceScore: number; // Score de 0 à 1
  reasoning: string; // Pourquoi cette activité est recommandée
  benefits: string[];
  typicalSituations: string;
  estimatedDuration?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

export interface UserStateAnalysis {
  emotionalState: string;
  currentNeeds: string[];
  potentialChallenges: string[];
  growthAreas: string[];
  recommendedApproach: string;
}

export interface RAGDocument {
  id: string;
  content: string;
  metadata: {
    type: 'activity' | 'practice' | 'category';
    title?: string;
    category?: string;
    tags?: string[];
    difficulty?: string;
    [key: string]: any;
  };
  embedding?: number[];
}

export interface BilanAgentConfig {
  modelName: string;
  temperature: number;
  maxTokens: number;
  topK: number; // Nombre de documents RAG à récupérer
  similarityThreshold: number; // Seuil de similarité pour les documents RAG
}
