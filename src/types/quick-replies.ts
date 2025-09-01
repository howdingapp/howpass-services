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
  activityId?: string; // Identifiant de l'activité associée si pertinent
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

/**
 * Exemples d'utilisation des quick replies typées
 */
export const QuickReplyExamples = {
  text: {
    type: 'text' as const,
    text: 'Plus de détails'
  },
  practice: {
    type: 'practice' as const,
    text: 'Découvrir la méditation',
    practiceId: 'meditation-123'
  },
  practiceWithActivity: {
    type: 'practice' as const,
    text: 'Participer à la session yoga',
    practiceId: 'yoga-456',
    activityId: 'yoga-session-789'
  }
};
