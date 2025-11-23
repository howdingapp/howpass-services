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
 * Structure simplifiée d'une pratique pour le top 4
 */
export interface BilanFamilyTopPractice {
  id: string;
  title: string;
  relevanceScore: number;
}

/**
 * Structure simplifiée d'une activité pour le top 4
 */
export interface BilanFamilyTopActivity {
  id: string;
  title: string;
  relevanceScore: number;
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
  topPractices: BilanFamilyTopPractice[]; // Top 4 des pratiques associées à cette famille
  topActivities: BilanFamilyTopActivity[]; // Top 4 des activités associées à cette famille
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
  questionnaires?: { info?: string; value?: BilanQuestionnaireWithChunks[] };
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
  questionnaires: {
    info: string;
    value: BilanQuestionnaireWithChunks[];
  };
  computedAt?: string;
}

/**
 * Type pour une quick reply dans un questionnaire (avec chunks)
 */
export interface BilanQuestionQuickReplyWithChunks {
  text: string;
  icon?: string;
  chunks: BilanChunk[];
}

/**
 * Type pour une question dans un questionnaire (avec chunks)
 */
export interface BilanQuestionWithChunks {
  question: string;
  quickReplies: Array<BilanQuestionQuickReplyWithChunks>;
}

/**
 * Type pour un questionnaire complet (avec chunks)
 */
export type BilanQuestionnaireWithChunks = Array<BilanQuestionWithChunks>;

/**
 * Questions de bilan prédéfinies avec leurs réponses suggérées
 * Chaque question inclut la question elle-même et des quick replies avec icônes emoji et chunks
 * Chaque quickReply a ses propres chunks précalculés
 */
export const INITIAL_BILAN_QUESTIONS: BilanQuestionnaireWithChunks = [
  {
    question: "🌿 Comment te sens-tu en ce moment ?",
    quickReplies: [
      { text: "😴 Fatigué(e) physiquement", icon: "sleep", chunks: [{ type: "symptome_chunk", text: "fatigue physique" }] },
      { text: "😰 Stressé(e) ou tendu(e)", icon: "alert-triangle", chunks: [{ type: "symptome_chunk", text: "stress tension" }] },
      { text: "🤯 Trop dans le mental / éparpillé(e)", icon: "zap", chunks: [{ type: "user_situation_chunk", text: "mental éparpillé" }] },
      { text: "💧 Émotif(ve) ou hypersensible", icon: "heart", chunks: [{ type: "symptome_chunk", text: "émotivité hypersensibilité" }] },
      { text: "🌀 Démotivé(e) ou en perte de sens", icon: "smile", chunks: [{ type: "user_situation_chunk", text: "démotivation perte de sens" }] },
      { text: "🌞 Bien, envie d'évoluer encore", icon: "heart", chunks: [{ type: "with_benefit_chunk", text: "envie d'évoluer" }] }
    ]
  },
  {
    question: "🌸 Ce que tu aimerais le plus améliorer",
    quickReplies: [
      { text: "🌿 Mon énergie", icon: "zap", chunks: [{ type: "with_benefit_chunk", text: "améliorer énergie" }] },
      { text: "🛏️ Mon sommeil", icon: "sleep", chunks: [{ type: "with_benefit_chunk", text: "améliorer sommeil" }] },
      { text: "🌸 Mon calme intérieur", icon: "heart", chunks: [{ type: "with_benefit_chunk", text: "retrouver calme intérieur" }] },
      { text: "💆‍♀️ Ma relation à mon corps", icon: "heart", chunks: [{ type: "with_benefit_chunk", text: "améliorer relation au corps" }] },
      { text: "💫 Ma confiance / mon estime", icon: "heart", chunks: [{ type: "with_benefit_chunk", text: "renforcer confiance estime" }] },
      { text: "💖 Mes émotions", icon: "heart", chunks: [{ type: "with_benefit_chunk", text: "gérer émotions" }] },
      { text: "⚖️ Mon équilibre global", icon: "smile", chunks: [{ type: "with_benefit_chunk", text: "retrouver équilibre global" }] },
      { text: "🔮 Mon alignement de vie", icon: "explore", chunks: [{ type: "with_benefit_chunk", text: "alignement de vie" }] }
    ]
  },
  {
    question: "🌞 Ton rythme de vie",
    quickReplies: [
      { text: "⏰ Je cours tout le temps / je suis souvent surmené(e)", icon: "zap", chunks: [{ type: "user_situation_chunk", text: "surmenage rythme effréné" }] },
      { text: "🌀 J'ai du mal à trouver du temps pour moi", icon: "alert-triangle", chunks: [{ type: "user_situation_chunk", text: "manque de temps pour soi" }] },
      { text: "🌿 J'arrive à maintenir un bon équilibre", icon: "smile", chunks: [{ type: "user_situation_chunk", text: "bon équilibre de vie" }] },
      { text: "🕊️ Ma vie est plutôt calme et posée", icon: "heart", chunks: [{ type: "user_situation_chunk", text: "vie calme posée" }] }
    ]
  },
  {
    question: "💆‍♀️ Ton rapport à ton corps",
    quickReplies: [
      { text: "🔸 Raide ou tendu(e)", icon: "alert-triangle", chunks: [{ type: "symptome_chunk", text: "raideur tension corporelle" }] },
      { text: "💤 Fatigué(e), sans énergie", icon: "sleep", chunks: [{ type: "symptome_chunk", text: "fatigue manque d'énergie" }] },
      { text: "🌸 En déséquilibre (hormones, digestion, sommeil)", icon: "alert-triangle", chunks: [{ type: "symptome_chunk", text: "déséquilibre hormones digestion sommeil" }] },
      { text: "🌺 Bien dans l'ensemble, envie d'entretien", icon: "smile", chunks: [{ type: "with_benefit_chunk", text: "entretien du corps" }] },
      { text: "🌫️ Déconnecté(e), besoin de me reconnecter à lui", icon: "explore", chunks: [{ type: "user_situation_chunk", text: "déconnexion du corps" }] },
      { text: "🔥 Avec des douleurs", icon: "alert-triangle", chunks: [{ type: "symptome_chunk", text: "douleurs" }] }
    ]
  },
  {
    question: "💖 Tes émotions",
    quickReplies: [
      { text: "🌧️ Je me sens souvent submergé(e)", icon: "alert-triangle", chunks: [{ type: "user_situation_chunk", text: "submergé par les émotions" }] },
      { text: "🌊 Je garde tout pour moi", icon: "heart", chunks: [{ type: "user_situation_chunk", text: "garder tout pour soi" }] },
      { text: "💔 Je me sens vide ou triste", icon: "heart", chunks: [{ type: "symptome_chunk", text: "vide tristesse" }] },
      { text: "💫 Je ressens beaucoup, parfois trop", icon: "heart", chunks: [{ type: "user_situation_chunk", text: "ressentir beaucoup d'émotions" }] },
      { text: "🌈 Je me sens stable et prêt(e) à m'élever", icon: "smile", chunks: [{ type: "with_benefit_chunk", text: "stabilité émotionnelle" }] },
      { text: "😬 j'ai tendance à éviter les conflits", icon: "alert-triangle", chunks: [{ type: "user_situation_chunk", text: "éviter les conflits" }] }
    ]
  },
  {
    question: "🌿 Ton besoin du moment",
    quickReplies: [
      { text: "⚡ Recharger mes batteries", icon: "zap", chunks: [{ type: "with_benefit_chunk", text: "recharger batteries" }] },
      { text: "🌸 Lâcher prise", icon: "heart", chunks: [{ type: "with_benefit_chunk", text: "lâcher prise" }] },
      { text: "🌼 Me reconnecter à moi-même", icon: "explore", chunks: [{ type: "with_benefit_chunk", text: "se reconnecter à soi-même" }] },
      { text: "🔮 Retrouver du sens", icon: "explore", chunks: [{ type: "with_benefit_chunk", text: "retrouver du sens" }] },
      { text: "💛 Me faire du bien simplement", icon: "heart", chunks: [{ type: "with_benefit_chunk", text: "se faire du bien" }] }
    ]
  },
  {
    question: "🐾 As-tu un compagnon à quatre pattes ?",
    quickReplies: [
      { text: "🐶 Oui, j'aimerais aussi prendre soin de mon animal", icon: "heart", chunks: [{ type: "user_situation_chunk", text: "compagnon animal" }] },
      { text: "🚫 Non, pas pour l'instant", icon: "smile", chunks: [] }
    ]
  }
];

/**
 * Structure complète de globalIntentInfos pour le bilan
 */
export interface BilanGlobalIntentInfos {
  bilanUniverContext: BilanUniverContextComplete;
}