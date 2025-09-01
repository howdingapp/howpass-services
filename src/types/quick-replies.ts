/**
 * Types pour les quick replies du chatbot de recommandation
 */

/**
 * Interface de base pour toutes les quick replies
 */
export interface BaseQuickReply {
  text: string;
}

/**
 * Quick reply de type texte simple
 */
export interface TextQuickReply extends BaseQuickReply {
  type: 'text';
}

/**
 * Quick reply de type lien vers une pratique
 */
export interface PracticeQuickReply extends BaseQuickReply {
  type: 'practice';
  practiceId: string;
}

/**
 * Union type pour toutes les quick replies
 */
export type QuickReply = TextQuickReply | PracticeQuickReply;

/**
 * Interface pour la réponse du chatbot avec quick replies typées
 */
export interface RecommendationResponseWithTypedQuickReplies {
  response: string;
  quickReplies: QuickReply[];
}
