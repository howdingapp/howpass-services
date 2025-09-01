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
 * Interface pour les réponses avec suggestions rapides (compatibilité avec l'ancien format)
 */
export interface ChatBotResponseWithQuickReplies extends BaseChatBotResponse {
  quickReplies: string[];
}

/**
 * Interface pour les réponses avec suggestions rapides typées
 */
export interface ChatBotResponseWithTypedQuickReplies extends BaseChatBotResponse {
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
  recommandedCategories: string;
  recommandedActivities: string;
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
}

/**
 * Type spécifique pour les réponses de RecommendationChatBot (compatibilité)
 */
export interface RecommendationMessageResponse extends IAMessageResponse {
  quickReplies: string[];
}

/**
 * Type spécifique pour les réponses de RecommendationChatBot avec quick replies typées
 */
export interface RecommendationMessageResponseWithTypedQuickReplies extends IAMessageResponse {
  quickReplies: QuickReply[];
}


