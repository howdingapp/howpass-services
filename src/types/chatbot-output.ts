/**
 * Types pour les schémas de sortie des ChatBots
 */

import { QuickReply } from './quick-replies';

/**
 * Interface de base pour toutes les réponses de ChatBot
 */
export interface BaseChatBotResponse {
  response: string;
}

/**
 * Interface pour les réponses avec suggestions rapides typées
 */
export interface ChatBotResponseWithQuickReplies extends BaseChatBotResponse {
  quickReplies: QuickReply[];
}

/**
 * Interface pour le profil utilisateur dans les résumés
 */
export interface UserProfile {
  emotionalState: string;
  currentNeeds: string[];
  preferences: string[];
  constraints: string[];
}

/**
 * Interface pour une recommandation
 */
export interface Recommendation {
  recommendedActivities: string;
  recommendedCategories: string;
  relevanceScore: number;
  reasoning: string;
  benefits: string[];
}

/**
 * Interface pour les résumés de conversation de recommandation
 */
export interface RecommendationSummary {
  userProfile: UserProfile;
  recommendations: Recommendation[];
  nextSteps: string[];
}

/**
 * Interface pour les réponses de RecommendationChatBot
 */
export interface RecommendationChatBotResponse extends ChatBotResponseWithQuickReplies {
  // Hérite de response et quickReplies
}

/**
 * Types utilitaires pour OpenAI
 */
export type OpenAIJsonSchema = {
  format: {
    type: "json_schema";
    name: string;
    schema: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
      description?: string;
      additionalProperties: boolean;
    };
    strict: boolean;
  };
};

/**
 * Type pour les schémas de sortie optionnels
 */
export type ChatBotOutputSchema = OpenAIJsonSchema | null;

/**
 * Type de base pour toutes les réponses IA avec les champs communs
 */
export interface IAMessageResponse {
  messageId: string;
  response: string;
  extractedData?: ExtractedRecommandations;
}

/**
 * Type spécifique pour les réponses de RecommendationChatBot avec quick replies typées
 */
export interface RecommendationMessageResponse extends IAMessageResponse {
  quickReplies: QuickReply[];
}

/**
 * Interface pour les éléments extraits des réponses d'outils
 */
export interface ExtractedItem {
  id: string;
  title: string;
  relevanceScore?: number;
  reasoning?: string;
}

/**
 * Interface pour le résultat de l'extraction des activités et pratiques
 */
export interface ExtractedRecommandations {
  activities: ExtractedItem[];
  practices: ExtractedItem[];
}

/**
 * Type pour contraindre les IDs basés sur les métadonnées de recommandations
 */
export type ConstrainedRecommendationId<T extends ExtractedRecommandations> = 
  T['activities'][number]['id'] | T['practices'][number]['id'];

/**
 * Interface pour les recommandations avec IDs contraints
 */
export interface ConstrainedRecommendation<T extends ExtractedRecommandations> {
  recommendedCategories: {
    id: ConstrainedRecommendationId<T>;
    name: string;
  }[];
  recommendedActivities: {
    id: ConstrainedRecommendationId<T>;
    name: string;
  }[];
  activitiesReasons: string;
  practicesReasons: string;
  relevanceScore: number;
  reasoning: string;
  benefits: string[];
}

/**
 * Interface pour les résumés de recommandation avec IDs contraints
 */
export interface ConstrainedRecommendationSummary<T extends ExtractedRecommandations> {
  userProfile: {
    supposedEmotionalState: string;
    supposedCurrentNeeds: string[];
    supposedPreferences: string[];
    supposedConstraints: string[];
  };
  recommendations: ConstrainedRecommendation<T>[];
  nextSteps: string[];
  importanteKnowledge: string[];
}




