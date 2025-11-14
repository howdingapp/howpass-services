import { RecommendationChatBotService } from './RecommendationChatBotService';
import { HowanaBilanContext, HowanaContext } from '../types/repositories';
import { ChatBotOutputSchema, RecommendationMessageResponse } from '../types';

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
 * Structure complète de globalIntentInfos pour le bilan
 */
export interface BilanGlobalIntentInfos {
  bilanUniverContext: {
    families: {
      info: string;
      value: Array<{
        id: string;
        name: string;
        dominanceScore: number;
        practicesCount: number;
        activitiesCount: number;
        howerAngelsCount: number;
        matchCount: number;
      }>;
    };
    practices: {
      info: string;
      value: any[];
    };
    activities: {
      info: string;
      value: any[];
    };
    howerAngels: {
      info: string;
      value: any[];
    };
    questionResponses: {
      info: string;
      value: Array<{ question?: string; response: string }>;
    };
    computedAt?: string;
  };
}

/**
 * Questions de bilan prédéfinies avec leurs réponses suggérées
 * Chaque question inclut la question elle-même et des quick replies avec icônes emoji
 */
const BILAN_QUESTIONS: Array<{
  question: string;
  quickReplies: Array<{ text: string; icon?: string }>;
}> = [
  {
    question: "🌿 Comment te sens-tu en ce moment ?",
    quickReplies: [
      { text: "😴 Fatigué(e) physiquement", icon: "sleep" },
      { text: "😰 Stressé(e) ou tendu(e)", icon: "alert-triangle" },
      { text: "🤯 Trop dans le mental / éparpillé(e)", icon: "zap" },
      { text: "💧 Émotif(ve) ou hypersensible", icon: "heart" },
      { text: "🌀 Démotivé(e) ou en perte de sens", icon: "smile" },
      { text: "🌞 Bien, envie d'évoluer encore", icon: "heart" }
    ]
  },
  {
    question: "🌸 Ce que tu aimerais le plus améliorer",
    quickReplies: [
      { text: "🌿 Mon énergie", icon: "zap" },
      { text: "🛏️ Mon sommeil", icon: "sleep" },
      { text: "🌸 Mon calme intérieur", icon: "heart" },
      { text: "💆‍♀️ Ma relation à mon corps", icon: "heart" },
      { text: "💫 Ma confiance / mon estime", icon: "heart" },
      { text: "💖 Mes émotions", icon: "heart" },
      { text: "⚖️ Mon équilibre global", icon: "smile" },
      { text: "🔮 Mon alignement de vie", icon: "explore" }
    ]
  },
  {
    question: "🌞 Ton rythme de vie",
    quickReplies: [
      { text: "⏰ Je cours tout le temps / je suis souvent surmené(e)", icon: "zap" },
      { text: "🌀 J'ai du mal à trouver du temps pour moi", icon: "alert-triangle" },
      { text: "🌿 J'arrive à maintenir un bon équilibre", icon: "smile" },
      { text: "🕊️ Ma vie est plutôt calme et posée", icon: "heart" }
    ]
  },
  {
    question: "💆‍♀️ Ton rapport à ton corps",
    quickReplies: [
      { text: "🔸 Raide ou tendu(e)", icon: "alert-triangle" },
      { text: "💤 Fatigué(e), sans énergie", icon: "sleep" },
      { text: "🌸 En déséquilibre (hormones, digestion, sommeil)", icon: "alert-triangle" },
      { text: "🌺 Bien dans l'ensemble, envie d'entretien", icon: "smile" },
      { text: "🌫️ Déconnecté(e), besoin de me reconnecter à lui", icon: "explore" },
      { text: "🔥 Avec des douleurs", icon: "alert-triangle" }
    ]
  },
  {
    question: "💖 Tes émotions",
    quickReplies: [
      { text: "🌧️ Je me sens souvent submergé(e)", icon: "alert-triangle" },
      { text: "🌊 Je garde tout pour moi", icon: "heart" },
      { text: "💔 Je me sens vide ou triste", icon: "heart" },
      { text: "💫 Je ressens beaucoup, parfois trop", icon: "heart" },
      { text: "🌈 Je me sens stable et prêt(e) à m'élever", icon: "smile" },
      { text: "😬 j'ai tendance à éviter les conflits", icon: "alert-triangle" }
    ]
  },
  {
    question: "🌿 Ton besoin du moment",
    quickReplies: [
      { text: "⚡ Recharger mes batteries", icon: "zap" },
      { text: "🌸 Lâcher prise", icon: "heart" },
      { text: "🌼 Me reconnecter à moi-même", icon: "explore" },
      { text: "🔮 Retrouver du sens", icon: "explore" },
      { text: "💛 Me faire du bien simplement", icon: "heart" }
    ]
  },
  {
    question: "🐾 As-tu un compagnon à quatre pattes ?",
    quickReplies: [
      { text: "🐶 Oui, j'aimerais aussi prendre soin de mon animal", icon: "heart" },
      { text: "🚫 Non, pas pour l'instant", icon: "smile" }
    ]
  },
  //{
  //  question: "📍 Où souhaites-tu découvrir tes praticiens ?",
  //  quickReplies: [
  //    { text: "📍 Utiliser ma géolocalisation", icon: "explore" },
  //   { text: "✏️ Saisir ma ville / code postal", icon: "explore" }
  //  ]
  //}
];

export class BilanChatBotService extends RecommendationChatBotService {
  
  /**
   * Règles par défaut pour les bilans (format tableau)
   */
  protected override getDefaultRules(): string[] {
    return [
      "Tu es Howana, l'assistant exclusif du portail bien-être HOW PASS. Tu es bienveillant et professionnel. Réponses courtes (maximum 30 mots).",
      
      "[BILAN] Analyse du bilan et accompagnement: Tu es spécialisée dans l'analyse des bilans de bien-être et l'accompagnement personnalisé. Ton objectif est d'aider l'utilisateur à comprendre son bilan, à identifier les points d'amélioration et à lui proposer des recommandations HOWPASS adaptées.",
      
      `OBJECTIFS SPÉCIFIQUES:
      - Analyser l'état émotionnel et les besoins de l'utilisateur
      - Recommander les activités et pratiques HOWPASS les plus pertinentes disponibles sur la plateforme
      - Fournir une analyse détaillée de l'état de l'utilisateur
      - Donner des suggestions personnalisées et adaptées`,
      
      `STRATÉGIE DE RECOMMANDATION:
      - Pose des questions ciblées pour comprendre les besoins
      - Analyse les préférences et contraintes de l'utilisateur
      - Propose des activités HOWPASS avec un score de pertinence
      - Explique le raisonnement derrière chaque recommandation HOWPASS
      - Adapte tes suggestions selon le profil et l'expérience`,
      
      "Aide l'utilisateur à identifier ses besoins et ses objectifs, analyse son état émotionnel et ses préférences, propose des activités et pratiques avec un score de pertinence, explique le raisonnement derrière chaque recommandation, adapte tes suggestions selon son profil et son expérience.",
      
      `IMPORTANT - STRATÉGIE DE CONVERSATION:
      - Ne propose JAMAIS d'activités ou pratiques directement sans avoir d'abord creusé les besoins de l'utilisateur
      - Pose des questions ciblées pour comprendre son état émotionnel, ses contraintes, ses préférences
      - Écoute attentivement ses réponses avant de suggérer quoi que ce soit
      - L'objectif est de créer une vraie conversation, pas de donner des réponses toutes faites
      - Propose des activités/pratiques seulement après avoir bien compris ses besoins spécifiques`,
      
      "IMPORTANT: L'échange doit se limiter à environ 10 questions maximum, chaque réponse doit impérativement contenir une question pour maintenir l'engagement.",
      
      "STRATÉGIE: Commence par des questions ouvertes sur son état actuel, ses défis, ses envies, ne propose des activités/pratiques qu'après avoir bien cerné ses besoins spécifiques.",
      
      "CRUCIAL: Ne propose des activités/pratiques qu'après avoir posé au moins 3 questions pour comprendre les vrais besoins.",
      
      "L'utilisateur vient de remplir son bilan de bien-être. Aide-le à comprendre ses résultats, identifie les points d'amélioration et propose des recommandations personnalisées sur la plateforme HOW PASS.",
      
      `Utilisation des outils:
      - Utilise l'outil 'faq_search' UNIQUEMENT pour des questions informationnelles relevant des thèmes suivants: stress, anxiété, méditation, sommeil, concentration, équilibre émotionnel, confiance en soi, débutants (pratiques/activités), parrainage, ambassadeur Howana, Aper'How bien-être (définition, participation, organisation, types de pratiques)
      - Pour toute autre question (y compris compte/connexion, abonnement/prix, sécurité/données, support/bugs), ne pas utiliser 'faq_search'
      - Si la question concerne des recommandations personnalisées d'activités/pratiques, utilise 'activities_and_practices'`
    ];
  }

  /**
   * Redéfinit shouldComputeIntent pour retourner false tant qu'il reste des questions de bilan
   */
  protected override shouldComputeIntent(_context: HowanaContext): boolean {
    return true;
  }

  public override async computeIntent(context: HowanaContext, userMessage: string): Promise<{ intent: any; intentCost: number | null; globalIntentInfos: any }> {
    
    const remainBilanQuestion = context.metadata?.['remainBilanQuestion'] as number | undefined;
    const existingGlobalIntentInfos = context.metadata?.['globalIntentInfos'] as BilanGlobalIntentInfos | undefined;

    // Si remainBilanQuestion est défini et supérieur à 0, retourner un intent personnalisé
    if (remainBilanQuestion !== undefined && remainBilanQuestion > 1) {
      console.log(`⏭️ [BILAN] Calcul d'intent ignoré car il reste ${remainBilanQuestion} question(s) de bilan`);
      // Récupérer le globalIntentInfos existant
      return {
        intent: { 
          type: "bilan_questionnaire",
          universContext: {
            chunks: []
          }
        },
        intentCost: null,
        globalIntentInfos: existingGlobalIntentInfos || null
      };
    }
    // Calculer l'index de la question précédente (celle à laquelle l'utilisateur répond)
    const previousQuestionIndex = remainBilanQuestion !== undefined && remainBilanQuestion >= 0
      ? BILAN_QUESTIONS.length - remainBilanQuestion - 1
      : -1;
    
    // Récupérer la dernière question
    const previousQuestion = previousQuestionIndex >= 0 && previousQuestionIndex < BILAN_QUESTIONS.length
      ? BILAN_QUESTIONS[previousQuestionIndex]?.question
      : undefined;

    // Ajouter la nouvelle question-réponse aux réponses existantes
    const questionResponses = [
      ...existingGlobalIntentInfos!.bilanUniverContext.questionResponses.value,
      { question: previousQuestion, response: userMessage }
    ];

    console.log(`📋 [BILAN] Intent pour le calcule univers: ${JSON.stringify(questionResponses)}`);

    // Passer uniquement les réponses aux questions en JSON à la place du userMessage
    return super.computeIntent(context, JSON.stringify(questionResponses));
  }

  /**
   * Redéfinit handleIntent pour décrémenter le nombre de questions restantes
   * Si c'est la dernière réponse (remainBilanQuestion devient 0), passe forceSummary=true pour que BaseChatBotService génère le résumé
   */
  protected override async handleIntent(
    context: HowanaContext,
    userMessage: string,
    onIaResponse: (response: any) => Promise<void>,
    forceSummary: boolean = false
  ): Promise<HowanaContext> {
    // Récupérer le nombre de questions restantes
    const remainBilanQuestion = context.metadata?.['remainBilanQuestion'] as number | undefined;
    
    // Décrémenter si supérieur à 0
    let newRemainQuestion = remainBilanQuestion;
    if (remainBilanQuestion !== undefined && remainBilanQuestion > 0) {
      newRemainQuestion = remainBilanQuestion - 1;
      context.metadata = {
        ...context.metadata,
        ['remainBilanQuestion']: newRemainQuestion
      };
      console.log(`📉 [BILAN] Décrémentation de remainBilanQuestion: ${remainBilanQuestion} -> ${newRemainQuestion}`);
    }
    
    // Si c'est la dernière réponse (newRemainQuestion === 0), forcer la génération du résumé
    if (newRemainQuestion === 0) {
      console.log('✅ [BILAN] Dernière réponse détectée, génération du résumé au lieu de la réponse');
      
      // Vérifier la présence d'un intent et le calculer si nécessaire
      const currentIntentInfos = context.metadata?.['currentIntentInfos'] as any;
      let intent = currentIntentInfos?.intent;
      
      // Si l'intent n'existe pas, le calculer maintenant (car shouldComputeIntent était false avant)
      if (!intent) {
        console.log('🔄 [BILAN] Intent manquant, calcul de l\'intent pour la dernière réponse...');
        const intentResult = await this.computeIntent(context, userMessage);
        intent = intentResult.intent;
        
        // Mettre à jour le contexte avec l'intent calculé
        context.metadata = {
          ...context.metadata,
          ['currentIntentInfos']: {
            intent: intent || null,
            intentCost: intentResult.intentCost || null,
            intentContextText: null
          }
        };
      }
      
      // Calculer globalIntentInfos avant de générer le résumé (nécessaire pour avoir l'univers)
      if (intent) {
        const globalIntentInfos = await this.computeGlobalIntentInfos(intent, context, userMessage);
        context.metadata = {
          ...context.metadata,
          ['globalIntentInfos']: globalIntentInfos
        };
      } else {
        console.warn('⚠️ [BILAN] Aucun intent disponible pour calculer globalIntentInfos');
      }
      
      // Passer forceSummary=true pour que BaseChatBotService génère le résumé
      forceSummary = true;
    }
    
    // Appeler la méthode parente avec forceSummary
    return super.handleIntent(context, userMessage, onIaResponse, forceSummary);
  }

  /**
   * Fonction centralisée pour toutes les informations de contexte système
   */
  protected override async getSystemContext(context: any): Promise<string> {
    let contextInfo = '';


    // Contexte de la dernière recommandation Howana
    contextInfo += this.getPreviousConversationContext(context as any);
    // Ajouter les pratiques HOW PASS existantes
    contextInfo += (await this.getAvailablePracticesContext());

    return contextInfo;
  }

  /**
   * Redéfinit getActivitiesAndPracticesConstraints pour utiliser l'univers du contexte
   * au lieu de context.recommendations
   */
  protected override getActivitiesAndPracticesConstraints(context: HowanaContext): {
    availableActivityIds: string[];
    availablePracticeIds: string[];
    allAvailableIds: string[];
  } {
    // Récupérer l'univers depuis les métadonnées
    const bilanUniverContext = context.metadata?.['globalIntentInfos']?.bilanUniverContext as {
      practices?: { info?: string; value?: any[] };
      activities?: { info?: string; value?: any[] };
    } | undefined;

    // Extraire les pratiques et activités de l'univers
    const practicesFromUniverse = bilanUniverContext?.practices?.value || [];
    const activitiesFromUniverse = bilanUniverContext?.activities?.value || [];

    // Extraire uniquement les IDs pour créer les enums
    const availableActivityIds = activitiesFromUniverse.map((item: any) => item.id).filter((id: any) => id);
    const availablePracticeIds = practicesFromUniverse.map((item: any) => item.id).filter((id: any) => id);
    const allAvailableIds = [...availableActivityIds, ...availablePracticeIds];

    console.log(`📋 [BILAN] Contraintes générées depuis l'univers avec ${availableActivityIds.length} activités et ${availablePracticeIds.length} pratiques (IDs uniquement)`);

    return {
      availableActivityIds,
      availablePracticeIds,
      allAvailableIds
    };
  }
  
  protected override getSummaryOutputSchema(context: HowanaContext): any {
    const constraints = this.getActivitiesAndPracticesConstraints(context);
    const { availableActivityIds, availablePracticeIds, allAvailableIds } = constraints;

    console.log(`📋 [BILANS] Contraintes générées avec ${availableActivityIds.length} activités et ${availablePracticeIds.length} pratiques (IDs uniquement):`, {
      availableActivityIds,
      availablePracticeIds,
      allAvailableIds
    });

    return {
      format: { 
        type: "json_schema",
        name: "BilanSummary",
        schema: {
          type: "object",
          properties: {
            userProfile: this.getUserProfileSchemaFragment("Profil utilisateur analysé à partir de la conversation de bilan"),
            recommendation: this.getBilanRecommendationSchemaFragment(
              availableActivityIds,
              availablePracticeIds,
              "Recommandation personnalisée basée sur l'analyse du bilan de bien-être"
            ),
            importanteKnowledge: {
              type: "array",
              items: { type: "string" },
              description: "Messages destinés à l'utilisateur contenant les points clés à retenir pour optimiser votre parcours de bien-être (formulés en vous parlant directement)"
            }
          },
          required: ["userProfile", "recommendation", "importanteKnowledge"],
          additionalProperties: false,
          description: `Résumé personnalisé de votre bilan de bien-être avec recommandations adaptées. Les recommandations sont contraintes aux ${allAvailableIds.length} éléments disponibles dans le contexte.`
        },
        strict: true
      }
    };
  }

  /**
   * Schéma de recommandation spécifique au bilan qui ne demande que les IDs
   * Les noms seront enrichis après la génération du résumé depuis l'univers
   */
  protected getBilanRecommendationSchemaFragment(
    availableActivityIds: string[],
    availablePracticeIds: string[],
    description: string = "Recommandation personnalisée basée sur l'analyse du bilan de bien-être"
  ): any {
    const allAvailableIds = [...availableActivityIds, ...availablePracticeIds];
    
    return {
      type: "object",
      properties: {
        recommendedCategories: {
          type: "array",
          minItems: availablePracticeIds.length > 0 ? 1 : 0,
          maxItems: availablePracticeIds.length > 0 ? Math.max(2, availablePracticeIds.length) : 0,
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                enum: availablePracticeIds,
                description: "Identifiant unique de la pratique de bien-être recommandée"
              }
            },
            required: ["id"],
            additionalProperties: false
          },
          description: "Pratiques de bien-être recommandées basées sur l'analyse des besoins de l'utilisateur"
        },
        recommendedActivities: {
          type: "array",
          minItems: availableActivityIds.length > 0 ? 1 : 0,
          maxItems: availableActivityIds.length > 0 ? Math.max(2, availableActivityIds.length) : 0,
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                enum: availableActivityIds,
                description: "Identifiant unique de l'activité de bien-être recommandée"
              }
            },
            required: ["id"],
            additionalProperties: false
          },
          description: "Activités de bien-être recommandées basées sur l'analyse des besoins de l'utilisateur"
        },
        activitiesReasons: {
          type: "string",
          description: "Message destiné à l'utilisateur expliquant pourquoi ces activités vous correspondent (formulé en vous parlant directement l'un à l'autre)"
        },
        practicesReasons: {
          type: "string",
          description: "Message destiné à l'utilisateur expliquant pourquoi ces pratiques vous correspondent (formulé en vous parlant directement l'un à l'autre)"
        },
        relevanceScore: {
          type: "number",
          description: "Score de pertinence de la recommandation (0 = non pertinent, 1 = très pertinent)"
        },
        reasoning: {
          type: "string",
          description: "Message destiné à l'utilisateur expliquant pourquoi cette recommandation vous correspond (formulé en vous parlant directement l'un à l'autre)"
        },
        benefits: {
          type: "array",
          items: { type: "string" },
          description: "Messages destinés à l'utilisateur listant les bénéfices concrets que vous pourrez retirer (formulés en vous parlant directement)"
        },
        nextSteps: {
          type: "array",
          items: { type: "string" },
          description: "Messages destinés à l'utilisateur décrivant les actions concrètes à entreprendre pour progresser dans votre bien-être (formulés en vous parlant directement)"
        },
        top1Recommandation: {
          type: "object",
          properties: {
            id: {
              type: "string",
              enum: allAvailableIds,
              description: "Identifiant unique de la recommandation prioritaire (activité ou pratique)"
            },
            type: {
              type: "string",
              enum: ["activity", "practice"],
              description: "Type de la recommandation prioritaire"
            },
            reason: {
              type: "string",
              description: "Message destiné à l'utilisateur expliquant pourquoi cette recommandation est prioritaire pour vous (formulé en vous parlant directement)"
            }
          },
          required: ["id", "type", "reason"],
          additionalProperties: false,
          description: "Recommandation prioritaire unique, sélectionnée parmi les activités et pratiques disponibles"
        }
      },
      required: ["recommendedCategories", "recommendedActivities", "activitiesReasons", "practicesReasons", "relevanceScore", "reasoning", "benefits", "nextSteps", "top1Recommandation"],
      additionalProperties: false,
      description
    };
  }

  /**
   * Redéfinit recommendationRequiredForSummary pour retourner toujours false dans le cas du bilan
   * car l'univers est déjà calculé et disponible dans le contexte
   */
  protected override recommendationRequiredForSummary(_context: HowanaContext): boolean {
    return false;
  }

  /**
   * Redéfinit generateConversationSummary pour ajouter systématiquement l'univers dans le résumé
   */
  public override async generateConversationSummary(context: HowanaContext): Promise<{
    summary: any;
    extractedData: any;
    updatedContext: HowanaContext;
    cost_input?: number | null;
    cost_cached_input?: number | null;
    cost_output?: number | null;
  }> {
    // Appeler la méthode parente pour générer le résumé
    const result = await super.generateConversationSummary(context);

    // Récupérer l'univers depuis les métadonnées
    const bilanUniverContext = context.metadata?.['globalIntentInfos']?.bilanUniverContext as {
      families?: { info?: string; value?: any[] };
      practices?: { info?: string; value?: any[] };
      activities?: { info?: string; value?: any[] };
      howerAngels?: { info?: string; value?: any[] };
      questionResponses?: { info?: string; value?: Array<{ question?: string; response: string }> };
      computedAt?: string;
    } | undefined;

    // Si l'univers existe, enrichir les recommandations avec les noms et ajouter l'univers au résumé
    if (bilanUniverContext) {
      const univers = {
        families: bilanUniverContext.families || { info: '', value: [] },
        practices: bilanUniverContext.practices || { info: '', value: [] },
        activities: bilanUniverContext.activities || { info: '', value: [] },
        howerAngels: bilanUniverContext.howerAngels || { info: '', value: [] },
        questionResponses: bilanUniverContext.questionResponses || { info: '', value: [] },
        computedAt: bilanUniverContext.computedAt
      };

      // Créer des maps pour retrouver rapidement les noms par ID
      const practicesMap = new Map<string, string>();
      const activitiesMap = new Map<string, string>();
      
      (univers.practices.value || []).forEach((practice: any) => {
        if (practice.id) {
          practicesMap.set(practice.id, practice.title || practice.name || 'Pratique sans nom');
        }
      });
      
      (univers.activities.value || []).forEach((activity: any) => {
        if (activity.id) {
          activitiesMap.set(activity.id, activity.title || activity.name || 'Activité sans nom');
        }
      });

      // Enrichir les recommandations avec les noms
      if (result.summary && typeof result.summary === 'object' && !Array.isArray(result.summary)) {
        const summary = result.summary as any;
        
        // Enrichir recommendedCategories (pratiques)
        if (summary.recommendation?.recommendedCategories && Array.isArray(summary.recommendation.recommendedCategories)) {
          summary.recommendation.recommendedCategories = summary.recommendation.recommendedCategories.map((item: any) => {
            if (item.id && !item.name) {
              return { ...item, name: practicesMap.get(item.id) || 'Pratique sans nom' };
            }
            return item;
          });
        }
        
        // Enrichir recommendedActivities
        if (summary.recommendation?.recommendedActivities && Array.isArray(summary.recommendation.recommendedActivities)) {
          summary.recommendation.recommendedActivities = summary.recommendation.recommendedActivities.map((item: any) => {
            if (item.id && !item.name) {
              return { ...item, name: activitiesMap.get(item.id) || 'Activité sans nom' };
            }
            return item;
          });
        }
        
        // Enrichir top1Recommandation
        if (summary.recommendation?.top1Recommandation?.id && !summary.recommendation.top1Recommandation.name) {
          const top1Id = summary.recommendation.top1Recommandation.id;
          const top1Type = summary.recommendation.top1Recommandation.type;
          if (top1Type === 'practice') {
            summary.recommendation.top1Recommandation.name = practicesMap.get(top1Id) || 'Pratique sans nom';
          } else if (top1Type === 'activity') {
            summary.recommendation.top1Recommandation.name = activitiesMap.get(top1Id) || 'Activité sans nom';
          }
        }
        
        // Ajouter l'univers au résumé
        summary.univers = univers;
      } else {
        // Si le résumé n'est pas un objet, créer un nouveau résumé avec l'univers
        (result as any).summary = {
          ...(typeof result.summary === 'string' ? { message: result.summary } : (result.summary || {})),
          univers
        };
      }

      console.log('✅ [BILAN] Recommandations enrichies avec les noms et univers ajouté au résumé:', {
        familiesCount: univers.families.value?.length || 0,
        practicesCount: univers.practices.value?.length || 0,
        activitiesCount: univers.activities.value?.length || 0,
        howerAngelsCount: univers.howerAngels.value?.length || 0,
        practicesMapSize: practicesMap.size,
        activitiesMapSize: activitiesMap.size
      });
    } else {
      console.warn('⚠️ [BILAN] Aucun univers trouvé dans le contexte pour enrichir les recommandations');
    }

    return result;
  }

  protected override buildFirstUserPrompt(_context: HowanaContext): string {
    const context: HowanaBilanContext & HowanaContext = _context as HowanaBilanContext & HowanaContext;
    const hasPreviousContext = context.lastHowanaRecommandation || context.bilanData;
    
    let prompt = hasPreviousContext 
      ? `Dis bonjour et fais référence au contexte précédent pour personnaliser ta première réponse.`
      : `Présente-toi à l'utilisateur en tant que HOWANA, son guide bien-être. Explique-lui qu'en quelques questions, tu vas l'aider à découvrir les pratiques les plus alignées avec son énergie du moment. Invite-le à répondre simplement avec son ressenti du jour.`;

    prompt += `\n\nIMPORTANT : Les questions seront fournies automatiquement par le système dans le contexte. Tu n'as pas besoin de poser de questions dans ta réponse. Contente-toi de te présenter de manière chaleureuse et d'inviter l'utilisateur à répondre aux questions qui lui seront posées.`;

    return prompt;
  }


  /**
   * Schéma de sortie pour les messages en mode questions de bilan
   * Inclut la question suivante et un commentaire sur l'état de l'univers actuel
   */
  protected override getAddMessageOutputSchema(context: HowanaContext, forceSummaryToolCall: boolean = false): ChatBotOutputSchema {
    const remainQuestion = context.metadata?.['remainBilanQuestion'] as number | undefined;
    
    // Si on est en mode questions de bilan, utiliser un schéma spécial
    if (remainQuestion !== undefined && remainQuestion > 0) {
      // Description demandant une réponse courte et conversationnelle qui fait suite à la dernière réponse
      const description = `Message conversationnel court (≤ 30 mots) qui fait suite à la dernière réponse de l'utilisateur à la question posée.

La réponse doit être dans l'écoute, bienveillante et empathique. Montre que tu as compris et accueille ce que l'utilisateur vient de partager. Reste dans l'écoute active, sans conseiller de pratique ou d'activité pour le moment.

IMPORTANT : 
- Le message doit rester court (≤ 30 mots) et conversationnel
- Fais suite naturellement à la réponse de l'utilisateur
- Reste dans l'écoute, montre de l'empathie et de la compréhension
- N'inclus PAS de question dans ce message
- Ne propose PAS de pratique ou d'activité, reste dans l'écoute
- N'inclus PAS de quickReplies dans ce message`;
      
      return {
        format: { 
          type: "json_schema",
          name: "BilanQuestionResponse",
          schema: {
            type: "object",
            properties: {
              response: {
                type: "string",
                description
              }
            },
            required: ["response"],
            additionalProperties: false
          },
          strict: true
        }
      };
    }
    
    // Sinon, utiliser le comportement du parent
    return super.getAddMessageOutputSchema(context, forceSummaryToolCall);
  }

  /**
   * Construit la réponse finale en combinant le texte IA, la question et les quick replies
   * Dans le cas des questions de bilan, aiResponse.response est toujours du texte (string)
   */
  private buildFinalResponse(
    aiResponse: RecommendationMessageResponse,
    questionIndex: number
  ): RecommendationMessageResponse {
    const currentQuestion = questionIndex >= 0 && questionIndex < BILAN_QUESTIONS.length 
      ? BILAN_QUESTIONS[questionIndex] 
      : null;

    if (!currentQuestion) {
      // Si pas de question trouvée, retourner la réponse IA telle quelle
      return aiResponse;
    }

    // Construire la réponse finale : texte IA (toujours du texte dans ce cas) + saut de ligne + question
    const responseText = typeof aiResponse.response === 'string' 
      ? aiResponse.response 
      : String(aiResponse.response);
    const finalResponseText = `${responseText}\n\n${currentQuestion.question}`;

    // Convertir les quick replies en format QuickReply (TextQuickReply) avec icônes
    const quickReplies = currentQuestion.quickReplies.map(qr => ({
      type: 'text' as const,
      text: qr.text,
      practiceId: null,
      activityId: null,
      icon: qr.icon || undefined
    } as any));

    return {
      ...aiResponse,
      response: finalResponseText,
      quickReplies
    };
  }

  /**
   * Redéfinit generateFirstResponse pour construire la réponse finale avec question et quick replies
   * Initialise également le compteur remainBilanQuestion dans le contexte
   */
  public override async generateFirstResponse(context: HowanaContext): Promise<RecommendationMessageResponse> {
    // Initialiser le compteur remainBilanQuestion si ce n'est pas déjà fait
    context.metadata = {
      ...context.metadata,
      ['remainBilanQuestion']: BILAN_QUESTIONS.length
    };
    console.log(`📊 [BILAN] Initialisation de remainBilanQuestion à ${BILAN_QUESTIONS.length}`);

    // Appeler la méthode parente pour obtenir la réponse IA
    const aiResponse = await super.generateFirstResponse(context);

    // Pour la première réponse, toujours ajouter la première question (index 0)
    const firstQuestion = BILAN_QUESTIONS.length > 0 && BILAN_QUESTIONS[0] 
      ? BILAN_QUESTIONS[0] 
      : null;

    if (firstQuestion) {
      // Construire la réponse finale avec la première question
      return this.buildFinalResponse(aiResponse, 0);
    }

    // Sinon, retourner la réponse telle quelle
    return aiResponse;
  }

  /**
   * Redéfinit generateAIResponse pour construire la réponse finale avec question et quick replies
   */
  public override async generateAIResponse(
    context: HowanaContext, 
    userMessage: string,
  ): Promise<RecommendationMessageResponse> {
    // Appeler la méthode parente pour obtenir la réponse IA
    const aiResponse = await super.generateAIResponse(context, userMessage);

    // Vérifier si on est en mode questions de bilan
    const remainQuestion = context.metadata?.['remainBilanQuestion'] as number | undefined;
    
    if (remainQuestion !== undefined && remainQuestion > 0) {
      // Calculer l'index de la question actuelle
      const currentQuestionIndex = BILAN_QUESTIONS.length - remainQuestion;
      
      // Construire la réponse finale
      return this.buildFinalResponse(aiResponse, currentQuestionIndex);
    }

    // Sinon, retourner la réponse telle quelle
    return aiResponse;
  }


  /**
   * Schéma de sortie pour le calcul d'intent spécifique aux bilans
   * Si on est encore dans les réponses aux questions (remainBilanQuestion > 0),
   * retourne un schéma de chunks typés, sinon retourne le schéma du parent
   */
  protected override getIntentSchema(_context: HowanaContext): ChatBotOutputSchema {

    return {
      format: { 
        type: "json_schema",
        name: "BilanQuestionChunks",
        schema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["bilan_question"],
              description: "Type d'intent pour les questions de bilan"
            },
            universContext: {
              type: "object",
              properties: {
                chunks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        description: `Type du chunk extrait de la réponse de l'utilisateur. Valeurs possibles:
- "user_situation_chunk": Fragment de situation utilisateur (de son point de vue, par exemple: "Je me sens...", "J'ai besoin...")
- "i_have_symptome_chunk": Fragment décrivant un symptôme que l'utilisateur a (par exemple: "J'ai des maux de tête", "Je ressens de la fatigue")
- "with_benefit_chunk": Fragment décrivant un bénéfice recherché (par exemple: "pour me détendre", "pour réduire le stress")`,
                        enum: ["user_situation_chunk", "i_have_symptome_chunk", "with_benefit_chunk"]
                      },
                      text: {
                        type: "string",
                        description: "Texte du chunk extrait de la réponse de l'utilisateur"
                      }
                    },
                    required: ["type", "text"],
                    additionalProperties: false
                  },
                  description: "Chunks typés extraits de la réponse de l'utilisateur pour mieux comprendre son état et ses besoins dans le contexte du bilan"
                }
              },
              required: ["chunks"],
              additionalProperties: false
            }
          },
          required: ["type", "universContext"],
          additionalProperties: false
        },
        strict: true
      }
    };
  }

  /**
   * Redéfinit computeGlobalIntentInfos pour calculer l'univers et créer globalIntentInfos
   * Appelle computeUniverse et crée globalIntentInfos avec les résultats de recherche
   * @param intent L'intent calculé
   * @param context Le contexte de la conversation
   * @param userMessage Le message de l'utilisateur (réponse à la question précédente)
   */
  protected override async computeGlobalIntentInfos(
    intent: any, 
    context: HowanaContext, 
    userMessage?: string
  ): Promise<any> {
  
    // Récupérer le bilanUniverContext précédent depuis les métadonnées
    const previousBilanUniverContext = (context.metadata?.['globalIntentInfos'] as BilanGlobalIntentInfos | undefined)?.bilanUniverContext;
    
    // Récupérer remainQuestion directement depuis le contexte
    const remainQuestion = context.metadata?.['remainBilanQuestion'] as number | undefined;
    
    // Calculer l'index de la question précédente (celle à laquelle l'utilisateur répond)
    // Si remainQuestion est le nombre de questions restantes, la question précédente est à l'index:
    // BILAN_QUESTIONS.length - remainQuestion - 1
    // (car la question actuelle est à l'index BILAN_QUESTIONS.length - remainQuestion)
    const previousQuestionIndex = remainQuestion !== undefined && remainQuestion >= 0
      ? BILAN_QUESTIONS.length - remainQuestion - 1
      : -1;
    
    // Récupérer la question précédente directement depuis BILAN_QUESTIONS
    const previousQuestion = previousQuestionIndex >= 0 && previousQuestionIndex < BILAN_QUESTIONS.length
      ? BILAN_QUESTIONS[previousQuestionIndex]?.question
      : undefined;
    
    // Créer l'objet { question, response } pour la question actuelle
    const currentQuestionResponse: { question?: string; response: string } | undefined = userMessage ? {
      ...(previousQuestion ? { question: previousQuestion } : {}),
      response: userMessage
    } : undefined;
    
    // Accumuler les questions-réponses précédentes avec la nouvelle
    const questionResponses: Array<{ question?: string; response: string }> = 
      previousBilanUniverContext?.questionResponses?.value ? [...previousBilanUniverContext.questionResponses.value] : [];
    
    // Ajouter la nouvelle question-réponse si elle existe
    if (currentQuestionResponse) {
      questionResponses.push(currentQuestionResponse);
    }
    
    // Calculer l'univers avec l'intent (qui contient les chunks) et toutes les questions-réponses
    const totalQuestions = BILAN_QUESTIONS.length;
    const answeredQuestions = totalQuestions - (remainQuestion || 0);
    const universe = await this.computeUniverse(intent as BilanQuestionIntent, questionResponses, totalQuestions, answeredQuestions);
    
    // Créer globalIntentInfos avec les résultats de l'univers
    return {
      bilanUniverContext: {
        families: universe.families,
        practices: universe.practices,
        activities: universe.activities,
        howerAngels: universe.howerAngels,
        questionResponses: universe.questionResponses,
        computedAt: new Date().toISOString()
      }
    };

  }

  /**
   * Calcule l'univers du bilan en réalisant une recherche sémantique sur tous les chunks de l'intent
   * et en classant les familles par dominance par rapport aux pratiques et hower angels trouvés
   * @param intent L'intent contenant les chunks
   * @param questionResponses Le tableau contenant toutes les questions et réponses de l'utilisateur
   * @param totalQuestions Le nombre total de questions dans le formulaire
   * @param answeredQuestions Le nombre de questions déjà répondues
   */
  protected async computeUniverse(
    intent: BilanQuestionIntent, 
    questionResponses?: Array<{ question?: string; response: string }>,
    totalQuestions?: number,
    answeredQuestions?: number
  ): Promise<{
    families: {
      info: string;
      value: Array<{
        id: string;
        name: string;
        dominanceScore: number;
        practicesCount: number;
        activitiesCount: number;
        howerAngelsCount: number;
        matchCount: number;
      }>;
    };
    practices: {
      info: string;
      value: any[];
    };
    activities: {
      info: string;
      value: any[];
    };
    howerAngels: {
      info: string;
      value: any[];
    };
    questionResponses: {
      info: string;
      value: Array<{ question?: string; response: string }>;
    };
  }> {
    // Récupérer les chunks depuis l'intent (dans universContext)
    const chunks = intent?.universContext?.chunks || [];
    
    console.log("questionResponses ==> ", JSON.stringify(questionResponses));

    // Si pas de chunks, retourner un univers vide
    if (chunks.length === 0) {
      console.log('⚠️ [BILAN] Aucun chunk dans l\'intent pour calculer l\'univers');
      const questionResponsesInfo = totalQuestions !== undefined && answeredQuestions !== undefined
        ? `Il s'agit de la liste ordonnée des réponses aux questions d'un formulaire de bilan de bien-être. Le formulaire contient au total ${totalQuestions} questions. L'utilisateur a répondu à ${answeredQuestions} question(s) jusqu'à présent${answeredQuestions < totalQuestions ? ' et remplit actuellement le questionnaire' : ' et a terminé le questionnaire'}. Chaque élément contient la question posée et la réponse de l'utilisateur dans l'ordre chronologique.`
        : `Il s'agit de la liste ordonnée des réponses aux questions d'un formulaire de bilan de bien-être. Chaque élément contient la question posée et la réponse de l'utilisateur dans l'ordre chronologique.`;
      
      const emptyResult: {
        families: { info: string; value: any[] };
        practices: { info: string; value: any[] };
        activities: { info: string; value: any[] };
        howerAngels: { info: string; value: any[] };
        questionResponses: { info: string; value: Array<{ question?: string; response: string }> };
      } = {
        families: {
          info: 'Liste des familles de pratiques bien-être identifiées à partir des réponses de l\'utilisateur, classées par score de dominance. Chaque famille représente un domaine de bien-être (ex: méditation, yoga, sophrologie, etc.) et contient le nombre de pratiques, activités et hower angels associés.',
          value: []
        },
        practices: {
          info: 'Liste des pratiques bien-être HOW PASS identifiées comme pertinentes pour l\'utilisateur basées sur ses réponses au questionnaire. Chaque pratique inclut un score de pertinence et un compteur de matchs indiquant combien de fois elle a été trouvée dans les recherches sémantiques.',
          value: []
        },
        activities: {
          info: 'Liste des activités bien-être HOW PASS identifiées comme pertinentes pour l\'utilisateur basées sur ses réponses au questionnaire. Chaque activité inclut un score de pertinence et un compteur de matchs indiquant combien de fois elle a été trouvée dans les recherches sémantiques.',
          value: []
        },
        howerAngels: {
          info: 'Liste des hower angels (praticiens) HOW PASS identifiés comme pertinents pour l\'utilisateur basés sur ses réponses au questionnaire. Chaque hower angel inclut un score de pertinence et les activités/pratiques qu\'il propose.',
          value: []
        },
        questionResponses: {
          info: questionResponsesInfo,
          value: questionResponses || []
        }
      };
      return emptyResult;
    }
    
    // Extraire tous les textes des chunks pour la recherche sémantique
    const allChunksTexts: string[] = chunks
      .filter(chunk => chunk.text)
      .map(chunk => chunk.text);
    
    if (allChunksTexts.length === 0) {
      console.log('⚠️ [BILAN] Aucun texte de chunk valide pour la recherche sémantique');
      const questionResponsesInfo = totalQuestions !== undefined && answeredQuestions !== undefined
        ? `Il s'agit de la liste ordonnée des réponses aux questions d'un formulaire de bilan de bien-être. Le formulaire contient au total ${totalQuestions} questions. L'utilisateur a répondu à ${answeredQuestions} question(s) jusqu'à présent${answeredQuestions < totalQuestions ? ' et remplit actuellement le questionnaire' : ' et a terminé le questionnaire'}. Chaque élément contient la question posée et la réponse de l'utilisateur dans l'ordre chronologique.`
        : `Il s'agit de la liste ordonnée des réponses aux questions d'un formulaire de bilan de bien-être. Chaque élément contient la question posée et la réponse de l'utilisateur dans l'ordre chronologique.`;
      
      const emptyResult: {
        families: { info: string; value: any[] };
        practices: { info: string; value: any[] };
        activities: { info: string; value: any[] };
        howerAngels: { info: string; value: any[] };
        questionResponses: { info: string; value: Array<{ question?: string; response: string }> };
      } = {
        families: {
          info: 'Liste des familles de pratiques bien-être identifiées à partir des réponses de l\'utilisateur, classées par score de dominance. Chaque famille représente un domaine de bien-être (ex: méditation, yoga, sophrologie, etc.) et contient le nombre de pratiques, activités et hower angels associés.',
          value: []
        },
        practices: {
          info: 'Liste des pratiques bien-être HOW PASS identifiées comme pertinentes pour l\'utilisateur basées sur ses réponses au questionnaire. Chaque pratique inclut un score de pertinence et un compteur de matchs indiquant combien de fois elle a été trouvée dans les recherches sémantiques.',
          value: []
        },
        activities: {
          info: 'Liste des activités bien-être HOW PASS identifiées comme pertinentes pour l\'utilisateur basées sur ses réponses au questionnaire. Chaque activité inclut un score de pertinence et un compteur de matchs indiquant combien de fois elle a été trouvée dans les recherches sémantiques.',
          value: []
        },
        howerAngels: {
          info: 'Liste des hower angels (praticiens) HOW PASS identifiés comme pertinents pour l\'utilisateur basés sur ses réponses au questionnaire. Chaque hower angel inclut un score de pertinence et les activités/pratiques qu\'il propose.',
          value: []
        },
        questionResponses: {
          info: questionResponsesInfo,
          value: questionResponses || []
        }
      };
      return emptyResult;
    }
    
    console.log(`🔍 [BILAN] Calcul de l'univers avec ${allChunksTexts.length} chunks de texte`);
    
    // Réaliser les recherches sémantiques en parallèle
    const [practicesResults, activitiesResults, howerAngelsResult] = await Promise.all([
      this.supabaseService.searchPracticesBySituationChunks(allChunksTexts),
      this.supabaseService.searchActivitiesBySituationChunks(allChunksTexts),
      this.supabaseService.searchHowerAngelsByUserSituation(allChunksTexts, 10) // Limiter à 10 hower angels
    ]);
    
    const practices = practicesResults.results || [];
    const activities = activitiesResults.results || [];
    const howerAngels = howerAngelsResult.success ? (howerAngelsResult.data || []) : [];
    
    console.log(`✅ [BILAN] ${practices.length} pratiques, ${activities.length} activités et ${howerAngels.length} hower angels trouvés`);
    
    // Compter les matchs par pratique et activité (pour identifier les tendances)
    const practiceMatchCount = new Map<string, number>(); // practiceId -> nombre de matchs
    const activityMatchCount = new Map<string, number>(); // activityId -> nombre de matchs
    
    // Compter les occurrences de chaque pratique
    practices.forEach((practice: any) => {
      const currentCount = practiceMatchCount.get(practice.id) || 0;
      practiceMatchCount.set(practice.id, currentCount + 1);
    });
    
    // Compter les occurrences de chaque activité
    activities.forEach((activity: any) => {
      const currentCount = activityMatchCount.get(activity.id) || 0;
      activityMatchCount.set(activity.id, currentCount + 1);
    });
    
    // Extraire les familles directement depuis les résultats de recherche (plus besoin de requêtes supplémentaires)
    const familyIds = new Set<string>();
    const familiesMap = new Map<string, { id: string; name: string; description?: string }>(); // familyId -> {id, name, description}
    const practiceFamilyMap = new Map<string, string>(); // practiceId -> familyId
    const activityFamilyMap = new Map<string, string>(); // activityId -> familyId
    const familyMatchCount = new Map<string, number>(); // familyId -> nombre total de matchs
    
    // Extraire les familles depuis les pratiques et compter les matchs
    practices.forEach((practice: any) => {
      if (practice.familyId) {
        familyIds.add(practice.familyId);
        practiceFamilyMap.set(practice.id, practice.familyId);
        
        // Compter les matchs pour cette famille (via cette pratique)
        const matchCount = practiceMatchCount.get(practice.id) || 1;
        const currentFamilyCount = familyMatchCount.get(practice.familyId) || 0;
        familyMatchCount.set(practice.familyId, currentFamilyCount + matchCount);
        
        // Stocker les informations de la famille si disponibles
        if (practice.familyName) {
          familiesMap.set(practice.familyId, {
            id: practice.familyId,
            name: practice.familyName,
            description: practice.familyDescription || undefined
          });
        }
      }
    });
    
    // Extraire les familles depuis les activités et compter les matchs
    activities.forEach((activity: any) => {
      if (activity.familyId) {
        familyIds.add(activity.familyId);
        activityFamilyMap.set(activity.id, activity.familyId);
        
        // Compter les matchs pour cette famille (via cette activité)
        const matchCount = activityMatchCount.get(activity.id) || 1;
        const currentFamilyCount = familyMatchCount.get(activity.familyId) || 0;
        familyMatchCount.set(activity.familyId, currentFamilyCount + matchCount);
        
        // Stocker les informations de la famille si disponibles (priorité aux données des activités si plus complètes)
        if (activity.familyName && !familiesMap.has(activity.familyId)) {
          familiesMap.set(activity.familyId, {
            id: activity.familyId,
            name: activity.familyName,
            description: activity.familyDescription || undefined
          });
        }
      }
    });
    
    // Convertir la Map en Array pour compatibilité avec le code existant
    const familiesData: Array<{ id: string; name: string }> = Array.from(familiesMap.values());
    
    // Calculer la dominance des familles
    const familyDominance = new Map<string, {
      id: string;
      name: string;
      practicesCount: number;
      practicesScore: number; // Somme des scores de pertinence des pratiques
      activitiesCount: number;
      activitiesScore: number; // Somme des scores de pertinence des activités
      howerAngelsCount: number;
      howerAngelsScore: number; // Somme des scores de pertinence des hower angels
      matchCount: number; // Nombre total de matchs pour cette famille
    }>();
    
    // Initialiser toutes les familles
    familiesData.forEach(family => {
      familyDominance.set(family.id, {
        id: family.id,
        name: family.name,
        practicesCount: 0,
        practicesScore: 0,
        activitiesCount: 0,
        activitiesScore: 0,
        howerAngelsCount: 0,
        howerAngelsScore: 0,
        matchCount: familyMatchCount.get(family.id) || 0
      });
    });
    
    // Compter les pratiques par famille
    practices.forEach((practice: any) => {
      const familyId = practiceFamilyMap.get(practice.id);
      if (familyId) {
        const family = familyDominance.get(familyId);
        if (family) {
          family.practicesCount++;
          family.practicesScore += practice.relevanceScore || 0;
        }
      }
    });
    
    // Compter les activités par famille
    activities.forEach((activity: any) => {
      const familyId = activityFamilyMap.get(activity.id);
      if (familyId) {
        const family = familyDominance.get(familyId);
        if (family) {
          family.activitiesCount++;
          family.activitiesScore += activity.relevanceScore || 0;
        }
      }
    });
    
    // Compter les hower angels par famille (via leurs activités)
    // Pour simplifier, on va considérer qu'un hower angel contribue à toutes les familles de ses activités
    howerAngels.forEach((howerAngel: any) => {
      const howerAngelActivities = howerAngel.activities || [];
      const howerAngelFamilyIds = new Set<string>();
      
      // Récupérer les familles des activités du hower angel
      howerAngelActivities.forEach((activity: any) => {
        const familyId = activityFamilyMap.get(activity.id);
        if (familyId) {
          howerAngelFamilyIds.add(familyId);
        }
      });
      
      if (howerAngelFamilyIds.size > 0) {
        const scorePerFamily = (howerAngel.relevanceScore || 0) / howerAngelFamilyIds.size;
        howerAngelFamilyIds.forEach(familyId => {
          const family = familyDominance.get(familyId);
          if (family) {
            family.howerAngelsCount++;
            family.howerAngelsScore += scorePerFamily;
          }
        });
      }
    });
    
    // Calculer le score de dominance global pour chaque famille
    // Le score combine le nombre et les scores de pertinence des pratiques, activités et hower angels
    const familiesWithDominance = Array.from(familyDominance.values()).map(family => {
      // Score de dominance = (practicesScore * 0.4) + (activitiesScore * 0.3) + (howerAngelsScore * 0.3)
      // On pondère plus les pratiques car elles sont plus directes
      const dominanceScore = (family.practicesScore * 0.4) + (family.activitiesScore * 0.3) + (family.howerAngelsScore * 0.3);
      
      return {
        id: family.id,
        name: family.name,
        dominanceScore,
        practicesCount: family.practicesCount,
        activitiesCount: family.activitiesCount,
        howerAngelsCount: family.howerAngelsCount,
        matchCount: family.matchCount // Nombre total de matchs pour identifier les tendances
      };
    });
    
    // Trier par score de dominance décroissant
    familiesWithDominance.sort((a, b) => b.dominanceScore - a.dominanceScore);
    
    console.log(`📊 [BILAN] Classement de ${familiesWithDominance.length} familles par dominance:`, 
      familiesWithDominance.map(f => `${f.name} (${f.dominanceScore.toFixed(2)}, ${f.matchCount} matchs)`).join(', '));
    
    // Enrichir les pratiques et activités avec leur compteur de match
    const practicesWithMatchCount = practices.map((practice: any) => ({
      ...practice,
      matchCount: practiceMatchCount.get(practice.id) || 1
    }));
    
    const activitiesWithMatchCount = activities.map((activity: any) => ({
      ...activity,
      matchCount: activityMatchCount.get(activity.id) || 1
    }));
    
    // Construire les informations pour questionResponses
    const questionResponsesInfo = totalQuestions !== undefined && answeredQuestions !== undefined
      ? `Il s'agit de la liste ordonnée des réponses aux questions d'un formulaire de bilan de bien-être. Le formulaire contient au total ${totalQuestions} questions. L'utilisateur a répondu à ${answeredQuestions} question(s) jusqu'à présent${answeredQuestions < totalQuestions ? ' et remplit actuellement le questionnaire' : ' et a terminé le questionnaire'}. Chaque élément contient la question posée et la réponse de l'utilisateur dans l'ordre chronologique.`
      : `Il s'agit de la liste ordonnée des réponses aux questions d'un formulaire de bilan de bien-être. Chaque élément contient la question posée et la réponse de l'utilisateur dans l'ordre chronologique.`;
    
    const result: {
      families: {
        info: string;
        value: Array<{
          id: string;
          name: string;
          dominanceScore: number;
          practicesCount: number;
          activitiesCount: number;
          howerAngelsCount: number;
          matchCount: number;
        }>;
      };
      practices: {
        info: string;
        value: any[];
      };
      activities: {
        info: string;
        value: any[];
      };
      howerAngels: {
        info: string;
        value: any[];
      };
      questionResponses: {
        info: string;
        value: Array<{ question?: string; response: string }>;
      };
    } = {
      families: {
        info: 'Liste des familles de pratiques bien-être identifiées à partir des réponses de l\'utilisateur, classées par score de dominance. Chaque famille représente un domaine de bien-être (ex: méditation, yoga, sophrologie, etc.) et contient le nombre de pratiques, activités et hower angels associés.',
        value: familiesWithDominance
      },
      practices: {
        info: 'Liste des pratiques bien-être HOW PASS identifiées comme pertinentes pour l\'utilisateur basées sur ses réponses au questionnaire. Chaque pratique inclut un score de pertinence et un compteur de matchs indiquant combien de fois elle a été trouvée dans les recherches sémantiques.',
        value: practicesWithMatchCount
      },
      activities: {
        info: 'Liste des activités bien-être HOW PASS identifiées comme pertinentes pour l\'utilisateur basées sur ses réponses au questionnaire. Chaque activité inclut un score de pertinence et un compteur de matchs indiquant combien de fois elle a été trouvée dans les recherches sémantiques.',
        value: activitiesWithMatchCount
      },
      howerAngels: {
        info: 'Liste des hower angels (praticiens) HOW PASS identifiés comme pertinents pour l\'utilisateur basés sur ses réponses au questionnaire. Chaque hower angel inclut un score de pertinence et les activités/pratiques qu\'il propose.',
        value: howerAngels
      },
      questionResponses: {
        info: questionResponsesInfo,
        value: questionResponses || []
      }
    };
    
    return result;
  }

}
