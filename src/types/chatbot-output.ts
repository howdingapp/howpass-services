/**
 * Types pour les schémas de sortie des ChatBots
 */

import { QuickReply } from './quick-replies';
import { HowanaContext } from './repositories';

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
 * Type pour l'intent de recommandation basé sur le schéma JSON
 */
export interface RecommendationIntent {
  format: 'remote' | 'inPerson' | 'any';
  intent: 'search_hower_angel' | 'search_activities' | 'search_advices' | 'take_rdv' | 'discover' | 'know_more' | 'confirmation';
  rdvContext?: {
    type: 'hower_angel' | 'activity' | 'practice';
    id: string;
    designation: string | null;
  };
  searchContext?: {
    searchChunks: Array<{
      type: 'hower_angel_name_info' | 'user_situation_chunk' | 'i_have_symptome_chunk' | 'with_benefit_chunk' | 'category_name_info';
      text: string;
    }>;
    searchType: 'activity' | 'hower_angel' | 'practice';
    searchFormat: 'from_user_situation' | 'from_name_query';
  };
  knowMoreContext?: {
    type: 'hower_angel' | 'activity' | 'practice' | 'subject';
    designation: string;
    identifiant?: string;
  };
  confirmationContext?: {
    type: 'hower_angel' | 'activity' | 'practice';
  };
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
  cost?: number | null; // Nombre de tokens utilisés
  messageId: string;
  response: string;
  extractedData?: ExtractedRecommandations;
  updatedContext: HowanaContext;
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

/**
 * Interface pour un élément d'activité dans les résultats d'intent
 */
export interface ActivityItem {
  type: 'activity';
  id: string;
  title: string;
  shortDescription?: string;
  longDescription?: string;
  durationMinutes?: number;
  participants?: number;
  rating?: number;
  price?: number;
  benefits?: any;
  locationType?: string;
  address?: any;
  selectedKeywords?: any;
  typicalSituations?: any;
  relevanceScore: number;
}

/**
 * Interface pour un élément de pratique dans les résultats d'intent
 */
export interface PracticeItem {
  type: 'practice';
  id: string;
  title: string;
  shortDescription?: string;
  longDescription?: string;
  benefits?: any;
  typicalSituations?: any;
  relevanceScore: number;
}

/**
 * Interface pour un élément FAQ dans les résultats d'intent
 */
export interface FAQItem {
  type: 'faq';
  id: string;
  question: string;
  answer: string;
  keywords?: any;
  faqType?: string;
  active?: boolean;
  relevanceScore: number;
  typicalSituation?: any;
}

/**
 * Interface pour un élément hower angel dans les résultats d'intent
 */
export interface HowerAngelItem {
  id: string;
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  specialties?: Array<{
    id: string;
    title: string;
    shortDescription?: string;
  }>;
  experience?: string;
  profile: string;
  activities?: Array<{
    id: string;
    title: string;
    shortDescription?: string;
    longDescription?: string;
    durationMinutes?: number;
    participants?: number;
    rating?: number;
    price?: number;
    benefits?: any;
    locationType?: string;
    address?: any;
    selectedKeywords?: any;
    presentationImagePublicUrl?: string;
    presentationVideoPublicUrl?: string;
    status?: string;
    isActive?: boolean;
  }>;
  relevanceScore: number;
}

/**
 * Interface pour les résultats d'intent (résultats de recherche)
 */
export interface IntentResults {
  activities: ActivityItem[];
  practices: PracticeItem[];
  howerAngels: HowerAngelItem[];
}

/**
 * Interface pour les informations globales d'intent de recommandation
 */
export interface GlobalRecommendationIntentInfos {
  howerAngels: HowerAngelItem[];
  activities: ActivityItem[];
  practices: PracticeItem[];
  faqs: FAQItem[];
  focusedHowerAngel: HowerAngelItem | null;
  focusedActivity: ActivityItem | null;
  focusedPractice: PracticeItem | null;
  focusedFaqs: FAQItem[];
  pendingConfirmations: {
    focusedHowerAngel: HowerAngelItem | null;
    focusedActivity: ActivityItem | null;
    focusedPractice: PracticeItem | null;
  };
  unknownFocused: {
    type: 'hower_angel' | 'activity' | 'practice' | 'subject';
    designation: string;
  } | null;
}




