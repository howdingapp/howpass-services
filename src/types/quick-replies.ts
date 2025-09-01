/**
 * Types pour les quick replies du chatbot de recommandation
 */

/**
 * Interface de base pour toutes les quick replies
 */
export interface BaseQuickReply {
  text: string;
  practiceId: string | null; // Toujours présent mais peut être null
  activityId: string | null; // Toujours présent mais peut être null
}

/**
 * Quick reply de type texte simple
 */
export interface TextQuickReply extends BaseQuickReply {
  type: 'text';
  practiceId: null; // Doit être null pour les quick replies de type texte
  activityId: null; // Doit être null pour les quick replies de type texte
}

/**
 * Quick reply de type lien vers une pratique
 */
export interface PracticeQuickReply extends BaseQuickReply {
  type: 'practice';
  practiceId: string; // Doit être une string pour les quick replies de type pratique
  activityId: string | null; // Peut être une string ou null
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
    text: 'Plus de détails',
    practiceId: null,
    activityId: null
  },
  practice: {
    type: 'practice' as const,
    text: 'Découvrir la méditation',
    practiceId: 'meditation-123',
    activityId: null
  },
  practiceWithActivity: {
    type: 'practice' as const,
    text: 'Participer à la session yoga',
    practiceId: 'yoga-456',
    activityId: 'yoga-session-789'
  }
};
