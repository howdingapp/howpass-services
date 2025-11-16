
import { HowanaBilanContext, HowanaContext, HowanaRecommandationContext } from '../types/repositories';
import { ChatBotOutputSchema, ExtractedRecommandations, GlobalRecommendationIntentInfos, OpenAIToolsDescription, RecommendationIntent, RecommendationMessageResponse } from '../types';
import {
  BilanChunk,
  BilanQuestionIntent,
  BilanUniverContext,
  BilanGlobalIntentInfos,
  BilanFamily
} from '../types/bilan';
import {
  PracticeSearchResult,
  ActivitySearchResult,
  HowerAngelSearchResult
} from '../types/search';
import { BaseChatBotService } from './BaseChatBotService';

/**
 * Questions de bilan prédéfinies avec leurs réponses suggérées
 * Chaque question inclut la question elle-même et des quick replies avec icônes emoji
 * Chaque quickReply a ses propres chunks précalculés
 */
const BILAN_QUESTIONS: Array<{
  question: string;
  quickReplies: Array<{ text: string; icon?: string; chunks: BilanChunk[] }>;
}> = [
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
  },
  //{
  //  question: "📍 Où souhaites-tu découvrir tes praticiens ?",
  //  quickReplies: [
  //    { text: "📍 Utiliser ma géolocalisation", icon: "explore" },
  //   { text: "✏️ Saisir ma ville / code postal", icon: "explore" }
  //  ]
  //}
];

export class BilanChatBotService extends BaseChatBotService<RecommendationMessageResponse> {
    
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

  protected buildSummarySystemPrompt(_context: HowanaContext): string {
    return "A partir des informations contextuelles, génère un résumé structuré détaillé qui permettra de comprendre les besoins de l'utilisateur et les recommandations proposées.";
  }

  protected getStartConversationOutputSchema(_context: HowanaContext): ChatBotOutputSchema {
    // Pas de schéma de sortie spécifique pour startConversation
    // L'IA répond librement selon le prompt
    return null;
  }

  protected getToolsDescription(_context: HowanaContext, _forceSummaryToolCall:boolean, _forWoo:boolean = false): OpenAIToolsDescription | null {
    return null;
  }

  protected async callTool(toolName: string, _toolArgs: any, _context: HowanaContext): Promise<any> {
    throw new Error(`Outil non supporté: ${toolName}`);
  }

  protected extractRecommandationsFromToolResponse(toolId: string, _response: any): ExtractedRecommandations {
    console.log(`🔧 Extraction pour l'outil: ${toolId}`);
    
    const activities: ExtractedRecommandations['activities'] = [];
    const practices: ExtractedRecommandations['practices'] = [];

    console.log(`🔧 Extraction terminée: ${activities.length} activités, ${practices.length} pratiques`);
    return { activities, practices };
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

    // Si remainBilanQuestion est défini et supérieur à 1, retourner un intent personnalisé
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
    
    // Dernière occurrence : cumuler les chunks des quickReplies et calculer les chunks pour les réponses custom
    console.log(`📋 [BILAN] Dernière question, cumul des chunks des quickReplies et calcul pour réponses custom`);
    
    // Récupérer toutes les questions-réponses existantes
    const existingQuestionResponses = existingGlobalIntentInfos?.bilanUniverContext?.questionResponses?.value || [];
    
    // Calculer l'index de la question précédente (celle à laquelle l'utilisateur répond)
    const previousQuestionIndex = remainBilanQuestion !== undefined && remainBilanQuestion >= 0
      ? BILAN_QUESTIONS.length - remainBilanQuestion - 1
      : -1;
    
    // Récupérer la dernière question
    const previousQuestion = previousQuestionIndex >= 0 && previousQuestionIndex < BILAN_QUESTIONS.length
      ? BILAN_QUESTIONS[previousQuestionIndex]?.question
      : undefined;
    
    // Parser la réponse : si c'est un entier, c'est un index, sinon c'est du texte custom (index = -1)
    let responseIndex = -1;
    let responseText = userMessage;
    const parsedIndex = parseInt(userMessage, 10);
    if (!isNaN(parsedIndex) && parsedIndex >= 0) {
      responseIndex = parsedIndex;
      // Convertir l'index en texte correspondant pour l'univers
      if (previousQuestionIndex >= 0 && previousQuestionIndex < BILAN_QUESTIONS.length) {
        const questionData = BILAN_QUESTIONS[previousQuestionIndex];
        if (questionData && responseIndex < questionData.quickReplies.length) {
          const quickReply = questionData.quickReplies[responseIndex];
          if (quickReply) {
            responseText = quickReply.text;
          }
        }
      }
    }
    
    // Ajouter la nouvelle question-réponse avec l'index et le texte converti
    const questionResponses: Array<{ question: string; index: number; response: string }> = [
      ...existingQuestionResponses,
      { question: previousQuestion!, index: responseIndex, response: responseText }
    ];
    
    // Séparer les réponses standard (index >= 0) de celles qui sont custom (index == -1)
    // Ajouter questionIndex (position dans questionResponses) pour les réponses standard
    const standardResponses: Array<{ question: string; index: number; response: string; questionIndex: number }> = [];
    const customResponses: Array<{ question: string; response: string }> = [];
    
    for (let i = 0; i < questionResponses.length; i++) {
      const qr = questionResponses[i];
      if (!qr || !qr.response) continue;
      
      if (qr.index === -1) {
        // Réponse custom : pas d'index valide
        const normalizedQr: { question: string; response: string } = {
          question: qr.question,
          response: qr.response
        };
        customResponses.push(normalizedQr);
      } else {
        // Réponse standard : index valide, ajouter questionIndex (position dans questionResponses)
        standardResponses.push({
          ...qr,
          questionIndex: i
        });
      }
    }
    
    // Cumuler tous les chunks des quickReplies correspondant aux réponses standard
    const quickReplyChunks: BilanChunk[] = [];
    
    for (let i = 0; i < standardResponses.length; i++) {
      const qr = standardResponses[i];
      if (!qr || qr.index < 0) continue;
      
      const questionData = BILAN_QUESTIONS[qr.questionIndex];
      if (!questionData) continue;
      
      const quickReply = questionData.quickReplies[qr.index];
      if (quickReply && quickReply.chunks) {
        quickReplyChunks.push(...quickReply.chunks);
      }
    }
    
    console.log(`✅ [BILAN] ${quickReplyChunks.length} chunks cumulés depuis les quickReplies`);
    console.log(`📝 [BILAN] ${customResponses.length} réponse(s) custom détectée(s)`);
    
    // Si on a des réponses custom, appeler super.computeIntent sur ces réponses
    let customChunks: BilanChunk[] = [];
    let intentCost: number | null = null;
    
    if (customResponses.length > 0) {

      console.log(`🔄 [BILAN] Appel de super.computeIntent pour les réponses custom`);
      
      // Appeler super.computeIntent avec le message combiné
      const customIntentResult = await super.computeIntent(context, JSON.stringify(customResponses));
      
      if (customIntentResult.intent && customIntentResult.intent.universContext?.chunks) {
        customChunks = customIntentResult.intent.universContext.chunks;
        intentCost = customIntentResult.intentCost;
        console.log(`✅ [BILAN] ${customChunks.length} chunks calculés depuis les réponses custom`);
      } else {
        console.warn(`⚠️ [BILAN] Aucun chunk trouvé dans l'intent calculé pour les réponses custom`);
      }
    }
    
    // Combiner tous les chunks (quickReplies + custom)
    const allChunks: BilanChunk[] = [...quickReplyChunks, ...customChunks];
    
    console.log(`✅ [BILAN] Total: ${allChunks.length} chunks (${quickReplyChunks.length} quickReplies + ${customChunks.length} custom)`);
    
    // Retourner un intent avec les chunks cumulés
    return {
      intent: {
        type: "bilan_questionnaire",
        universContext: {
          chunks: allChunks
        }
      },
      intentCost: intentCost,
      globalIntentInfos: existingGlobalIntentInfos
    };
  }

  /**
   * Redéfinit handleIntent pour décrémenter le nombre de questions restantes
   * Si c'est la dernière réponse (remainBilanQuestion devient 0), passe forceSummary=true pour que BaseChatBotService génère le résumé
   * Sinon, génère manuellement la réponse et l'envoie via onIaResponse
   */
  protected override async handleIntent(
    context: HowanaContext,
    userMessage: string,
    onIaResponse: (response: any) => Promise<void>,
    _forceSummary: boolean = false,
    _autoResponse?: string // Paramètre optionnel pour compatibilité avec la signature parente
  ): Promise<HowanaContext> {

    // Récupérer intent depuis le contexte
    const currentIntentInfos = context.metadata?.['currentIntentInfos'] as any;
    const intent = currentIntentInfos?.intent as RecommendationIntent | undefined;

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
    
    // Toujours calculer globalIntentInfos avant les handlers (avec userMessage pour les services qui en ont besoin)
    let globalIntentInfos = await this.computeGlobalIntentInfos(intent, context, userMessage);
    
    context.metadata = {
      ...context.metadata,
      ['globalIntentInfos']: globalIntentInfos
    };


    // Si c'est la dernière réponse (newRemainQuestion === 0), forcer la génération du résumé
    if (newRemainQuestion === 0) {
      console.log('✅ [BILAN] Dernière réponse détectée, génération du résumé au lieu de la réponse');
      // Appeler la méthode parente uniquement pour le forceSummary
      return super.handleIntent(context, userMessage, onIaResponse, true);
    }

    // Utiliser autoResponse pour passer le texte de la réponse à handleIntent
    // handleIntent créera la structure aiResponse et continuera les calculs subséquents
    return super.handleIntent(context, userMessage, onIaResponse, false, '');
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
     * Informations contextuelles des conversations précédentes
     */
  protected getPreviousConversationContext(context: HowanaRecommandationContext & HowanaContext): string {
    if (!context.lastHowanaRecommandation) return '';

    let previousContext = `\n\nCONTEXTE DE LA DERNIÈRE RECOMMANDATION HOWANA:`;
    
    if (context.lastHowanaRecommandation.userProfile) {
      const profile = context.lastHowanaRecommandation.userProfile;
      if (profile.supposedEmotionalState) {
        previousContext += `\n- État émotionnel précédent: ${profile.supposedEmotionalState}`;
      }
      if (profile.supposedCurrentNeeds && profile.supposedCurrentNeeds.length > 0) {
        previousContext += `\n- Besoins précédents: ${profile.supposedCurrentNeeds.join(', ')}`;
      }
      if (profile.supposedPreferences && profile.supposedPreferences.length > 0) {
        previousContext += `\n- Préférences précédentes: ${profile.supposedPreferences.join(', ')}`;
      }
      if (profile.supposedConstraints && profile.supposedConstraints.length > 0) {
        previousContext += `\n- Contraintes précédentes: ${profile.supposedConstraints.join(', ')}`;
      }
    }

    if (context.lastHowanaRecommandation.recommendedCategories && context.lastHowanaRecommandation.recommendedCategories.length > 0) {
      const categories = context.lastHowanaRecommandation.recommendedCategories.map(cat => cat.name).join(', ');
      previousContext += `\n- Pratiques recommandées précédemment: ${categories}`;
    }

    if (context.lastHowanaRecommandation.recommendedActivities && context.lastHowanaRecommandation.recommendedActivities.length > 0) {
      const activities = context.lastHowanaRecommandation.recommendedActivities.map(act => act.name).join(', ');
      previousContext += `\n- Activités recommandées précédemment: ${activities}`;
    }

    if (context.lastHowanaRecommandation.activitiesReasons) {
      previousContext += `\n- Raisons des activités précédentes: ${context.lastHowanaRecommandation.activitiesReasons}`;
    }

    if (context.lastHowanaRecommandation.practicesReasons) {
      previousContext += `\n- Raisons des pratiques précédentes: ${context.lastHowanaRecommandation.practicesReasons}`;
    }

    if (context.lastHowanaRecommandation.importanteKnowledge && context.lastHowanaRecommandation.importanteKnowledge.length > 0) {
      previousContext += `\n- Connaissances importantes précédentes: ${context.lastHowanaRecommandation.importanteKnowledge.join(', ')}`;
    }

    if (context.lastHowanaRecommandation.top1Recommandation) {
      const top1 = context.lastHowanaRecommandation.top1Recommandation;
      previousContext += `\n- Recommandation prioritaire précédente: ${top1.name} (${top1.type === 'activity' ? 'activité' : 'pratique'}) - ${top1.reason}`;
    }

    previousContext += `\n\nUtilise ces informations pour comprendre l'évolution de l'utilisateur et adapter tes questions et recommandations. Évite de répéter exactement les mêmes suggestions.`;

    return previousContext;
  }

  /**
   * Redéfinit getActivitiesAndPracticesConstraints pour utiliser l'univers du contexte
   * au lieu de context.recommendations
   * Inclut les pratiques et activités de l'univers ainsi que les top 4 de chaque famille
   */
  protected getActivitiesAndPracticesConstraints(context: HowanaContext): {
    availableActivityIds: string[];
    availablePracticeIds: string[];
    allAvailableIds: string[];
  } {
    // Récupérer l'univers depuis les métadonnées
    const bilanUniverContext = context.metadata?.['globalIntentInfos']?.bilanUniverContext as BilanUniverContext | undefined;

    // Extraire les pratiques et activités de l'univers
    // Limiter à 10 meilleurs résultats pour chaque groupe pour éviter de surcharger le summary
    const practicesFromUniverse = (bilanUniverContext?.practices?.value || []).slice(0, 10);
    const activitiesFromUniverse = (bilanUniverContext?.activities?.value || []).slice(0, 10);

    // Extraire les IDs des top practices et top activities de chaque famille
    const families = bilanUniverContext?.families?.value || [];
    const topPracticeIds = new Set<string>();
    const topActivityIds = new Set<string>();
    
    families.forEach((family: BilanFamily) => {
      // Ajouter les IDs des top 4 pratiques de cette famille
      if (family.topPractices && Array.isArray(family.topPractices)) {
        family.topPractices.forEach((practice: any) => {
          if (practice.id) {
            topPracticeIds.add(practice.id);
          }
        });
      }
      
      // Ajouter les IDs des top 4 activités de cette famille
      if (family.topActivities && Array.isArray(family.topActivities)) {
        family.topActivities.forEach((activity: any) => {
          if (activity.id) {
            topActivityIds.add(activity.id);
          }
        });
      }
    });

    // Extraire uniquement les IDs pour créer les enums
    const availableActivityIdsFromUniverse = activitiesFromUniverse.map((item: any) => item.id).filter((id: any) => id);
    const availablePracticeIdsFromUniverse = practicesFromUniverse.map((item: any) => item.id).filter((id: any) => id);
    
    // Combiner les IDs de l'univers avec les top IDs des familles (sans doublons)
    const availableActivityIds = Array.from(new Set([...availableActivityIdsFromUniverse, ...Array.from(topActivityIds)]));
    const availablePracticeIds = Array.from(new Set([...availablePracticeIdsFromUniverse, ...Array.from(topPracticeIds)]));
    const allAvailableIds = [...availableActivityIds, ...availablePracticeIds];

    console.log(`📋 [BILAN] Contraintes générées depuis l'univers avec ${availableActivityIds.length} activités et ${availablePracticeIds.length} pratiques (incluant les top 4 de chaque famille)`);

    return {
      availableActivityIds,
      availablePracticeIds,
      allAvailableIds
    };
  }
  
  protected override getSummaryOutputSchema(context: HowanaContext): any {
    const constraints = this.getActivitiesAndPracticesConstraints(context);
    const { availableActivityIds, availablePracticeIds, allAvailableIds } = constraints;

    // Récupérer les familles avec leurs pourcentages pour la description
    const bilanUniverContext = context.metadata?.['globalIntentInfos']?.bilanUniverContext as BilanUniverContext | undefined;
    const families = bilanUniverContext?.families?.value || [];
    
    // Construire la description avec les pourcentages de dominance
    let recommendationDescription = "Recommandation personnalisée basée sur l'analyse du bilan de bien-être. ";
    
    if (families.length > 0) {
      const familiesInfo = families.map((family: BilanFamily) => 
        `${family.name}: ${family.dominancePercentage.toFixed(1)}%`
      ).join(', ');
      
      recommendationDescription += `Les domaines de bien-être identifiés et leur représentation sont : ${familiesInfo}. `;
      recommendationDescription += "Idéalement, tes recommandations devraient être représentatives de ces pourcentages (par exemple, si une famille représente 40% de la dominance, environ 40% de tes recommandations devraient provenir de cette famille). ";
    }
    
    recommendationDescription += "Cependant, tu as la responsabilité finale de choisir ce qui semble le mieux correspondre aux besoins et réponses de l'utilisateur, même si cela ne correspond pas exactement aux pourcentages calculés. Priorise toujours la pertinence et l'adéquation avec les besoins exprimés par l'utilisateur.";

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
              recommendationDescription,
              families
            ),
            importanteKnowledge: {
              type: "array",
              items: { type: "string" },
              description: "Messages destinés à l'utilisateur contenant les points clés à retenir pour optimiser votre parcours de bien-être (formulés en vous parlant directement)"
            }
          },
          required: ["userProfile", "recommendation", "importanteKnowledge"],
          additionalProperties: false,
          description: `Résumé personnalisé de votre bilan de bien-être avec recommandations adaptées. Les recommandations sont contraintes aux ${allAvailableIds.length} éléments disponibles dans le contexte (incluant les pratiques et activités de l'univers ainsi que les top 4 de chaque famille identifiée).`
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
    description: string = "Recommandation personnalisée basée sur l'analyse du bilan de bien-être",
    families: BilanFamily[] = []
  ): any {
    const allAvailableIds = [...availableActivityIds, ...availablePracticeIds];
    
    // Vérifier si les tableaux sont vides pour éviter les enums vides
    const hasActivities = availableActivityIds.length > 0;
    const hasPractices = availablePracticeIds.length > 0;
    
    // Schéma réutilisable pour un item de recommandation avec juste un ID
    const recommendationItemSchema = (availableIds: string[], idDescription: string) => ({
      type: "object",
      properties: {
        id: {
          type: "string",
          enum: availableIds,
          description: idDescription
        }
      },
      required: ["id"],
      additionalProperties: false
    });
    
    // Construire les propriétés conditionnellement
    const properties: any = {};
    
    // top1Recommandation seulement si on a au moins un ID disponible
    if (allAvailableIds.length > 0) {
      properties.top1Recommandation = {
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
      };
    }
    
    // topRecommendedPanel avec propriétés conditionnelles
    const topRecommendedPanelProperties: any = {};
    const topRecommendedPanelRequired: string[] = [];
    
    if (hasPractices) {
      topRecommendedPanelProperties.orderedTopPractices = {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              enum: availablePracticeIds,
              description: "Identifiant unique de la pratique de bien-être"
            },
            relevanceScore: {
              type: "number",
              description: "Score de pertinence de cette pratique (0 = non pertinent, 1 = très pertinent)"
            },
            reason: {
              type: "string",
              description: "Message destiné à l'utilisateur expliquant pourquoi cette pratique a été choisie et pourquoi elle est à cette position dans l'ordre (du plus pertinent au moins pertinent), formulé en vous parlant directement"
            }
          },
          required: ["id", "relevanceScore", "reason"],
          additionalProperties: false
        },
        description: "Top des pratiques les plus pertinentes pour l'utilisateur, ordonnées par pertinence décroissante (du plus pertinent au moins pertinent)"
      };
      topRecommendedPanelRequired.push("orderedTopPractices");
    }
    
    if (hasActivities) {
      topRecommendedPanelProperties.orderedTopActivities = {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              enum: availableActivityIds,
              description: "Identifiant unique de l'activité de bien-être"
            },
            relevanceScore: {
              type: "number",
              description: "Score de pertinence de cette activité (0 = non pertinent, 1 = très pertinent)"
            },
            reason: {
              type: "string",
              description: "Message destiné à l'utilisateur expliquant pourquoi cette activité a été choisie et pourquoi elle est à cette position dans l'ordre (du plus pertinent au moins pertinent), formulé en vous parlant directement"
            }
          },
          required: ["id", "relevanceScore", "reason"],
          additionalProperties: false
        },
        description: "Top des activités les plus pertinentes pour l'utilisateur, ordonnées par pertinence décroissante (du plus pertinent au moins pertinent)"
      };
      topRecommendedPanelRequired.push("orderedTopActivities");
    }
    
    // Ajouter topRecommendedPanel seulement si on a au moins des pratiques ou des activités
    if (hasPractices || hasActivities) {
      topRecommendedPanelProperties.summary = {
        type: "string",
        description: "Message destiné à l'utilisateur résumant pourquoi ces recommandations ont été choisies et pourquoi cet ordre spécifique (formulé en vous parlant directement)"
      };
      topRecommendedPanelRequired.push("summary");
      
      properties.topRecommendedPanel = {
        type: "object",
        properties: topRecommendedPanelProperties,
        required: topRecommendedPanelRequired,
        additionalProperties: false,
        description: "Panneau regroupant les meilleures recommandations (pratiques et activités) avec leurs scores de pertinence"
      };
    }
    
    // byFamilyRecommendedPanel avec propriétés conditionnelles
    const byFamilyPanelItemProperties: any = {
      familyId: {
        type: "string",
        enum: families.map((f: BilanFamily) => f.id),
        description: "Identifiant de la famille de bien-être"
      },
      familyName: {
        type: "string",
        description: "Nom de la famille de bien-être"
      }
    };
    const byFamilyPanelItemRequired: string[] = ["familyId", "familyName"];
    
    if (hasPractices) {
      byFamilyPanelItemProperties.orderedRecommendedPractices = {
        type: "array",
        items: recommendationItemSchema(
          availablePracticeIds,
          "Identifiant unique de la pratique recommandée pour cette famille"
        ),
        description: "Pratiques recommandées pour cette famille, ordonnées par pertinence décroissante (idéalement représentatives du pourcentage de dominance de la famille)"
      };
      byFamilyPanelItemRequired.push("orderedRecommendedPractices");
    }
    
    if (hasActivities) {
      byFamilyPanelItemProperties.orderedRecommendedActivities = {
        type: "array",
        items: recommendationItemSchema(
          availableActivityIds,
          "Identifiant unique de l'activité recommandée pour cette famille"
        ),
        description: "Activités recommandées pour cette famille, ordonnées par pertinence décroissante (idéalement représentatives du pourcentage de dominance de la famille)"
      };
      byFamilyPanelItemRequired.push("orderedRecommendedActivities");
    }
    
    byFamilyPanelItemProperties.reason = {
      type: "string",
      description: "Message destiné à l'utilisateur expliquant pourquoi ces choix spécifiques ont été faits pour cette famille et pourquoi cet ordre de recommandation (du plus pertinent au moins pertinent), formulé en vous parlant directement"
    };
    byFamilyPanelItemRequired.push("reason");
    
    properties.byFamilyRecommendedPanel = {
      type: "array",
      items: {
        type: "object",
        properties: byFamilyPanelItemProperties,
        required: byFamilyPanelItemRequired,
        additionalProperties: false
      },
      description: "Recommandations organisées par famille de bien-être, permettant de structurer les suggestions selon les domaines identifiés"
    };
    
    // Champs conditionnels pour les raisons
    if (hasActivities) {
      properties.activitiesReasons = {
        type: "string",
        description: "Message destiné à l'utilisateur expliquant pourquoi ces activités vous correspondent (formulé en vous parlant directement l'un à l'autre)"
      };
    }
    
    if (hasPractices) {
      properties.practicesReasons = {
        type: "string",
        description: "Message destiné à l'utilisateur expliquant pourquoi ces pratiques vous correspondent (formulé en vous parlant directement l'un à l'autre)"
      };
    }
    
    // Propriétés toujours présentes
    properties.relevanceScore = {
      type: "number",
      description: "Score de pertinence de la recommandation (0 = non pertinent, 1 = très pertinent)"
    };
    properties.reasoning = {
      type: "string",
      description: "Message destiné à l'utilisateur expliquant pourquoi cette recommandation vous correspond (formulé en vous parlant directement l'un à l'autre)"
    };
    properties.benefits = {
      type: "array",
      items: { type: "string" },
      description: "Messages destinés à l'utilisateur listant les bénéfices concrets que vous pourrez retirer (formulés en vous parlant directement)"
    };
    properties.nextSteps = {
      type: "array",
      items: { type: "string" },
      description: "Messages destinés à l'utilisateur décrivant les actions concrètes à entreprendre pour progresser dans votre bien-être (formulés en vous parlant directement)"
    };
    
    // Construire le tableau required conditionnellement
    const required: string[] = [];
    if (properties.top1Recommandation) required.push("top1Recommandation");
    if (properties.topRecommendedPanel) required.push("topRecommendedPanel");
    if (properties.byFamilyRecommendedPanel) required.push("byFamilyRecommendedPanel");
    if (properties.activitiesReasons) required.push("activitiesReasons");
    if (properties.practicesReasons) required.push("practicesReasons");
    required.push("relevanceScore", "reasoning", "benefits", "nextSteps");
    
    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
      description
    };
  }

  /**
   * Schéma réutilisable pour le profil utilisateur
   * @param description Description personnalisée du champ
   */
  protected getUserProfileSchemaFragment(description: string = "Profil utilisateur analysé à partir de la conversation"): any {
    return {
      type: "object",
      properties: {
        supposedEmotionalState: {
          type: "string",
          description: "État émotionnel actuel de l'utilisateur, formulé de son point de vue (ex: 'Je me sens stressé', 'Je ressens de la fatigue')"
        },
        supposedCurrentNeeds: {
          type: "array",
          items: { type: "string" },
          description: "Besoins actuels identifiés, formulés du point de vue de l'utilisateur (ex: 'J'ai besoin de me détendre', 'Je veux retrouver de l'énergie')"
        },
        supposedPreferences: {
          type: "array",
          items: { type: "string" },
          description: "Préférences de l'utilisateur, formulées de son point de vue (ex: 'J'aime les activités en groupe', 'Je préfère le matin')"
        },
        supposedConstraints: {
          type: "array",
          items: { type: "string" },
          description: "Contraintes identifiées, formulées du point de vue de l'utilisateur (ex: 'Je n'ai que 30 minutes', 'Je ne peux pas sortir')"
        }
      },
      required: ["supposedEmotionalState", "supposedCurrentNeeds", "supposedPreferences", "supposedConstraints"],
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
    // Récupérer l'univers depuis les métadonnées
    const bilanUniverContext = context.metadata?.['globalIntentInfos']?.bilanUniverContext as BilanUniverContext | undefined;

    // Créer summaryContextHints avec l'univers tronqué à 10 résultats pour chaque groupe
    if (bilanUniverContext) {
      const truncatedUniverse = {
        families: bilanUniverContext.families || { info: '', value: [] },
        practices: {
          ...(bilanUniverContext.practices || { info: '', value: [] }),
          value: (bilanUniverContext.practices?.value || []).slice(0, 10)
        },
        activities: {
          ...(bilanUniverContext.activities || { info: '', value: [] }),
          value: (bilanUniverContext.activities?.value || []).slice(0, 10)
        },
        howerAngels: {
          ...(bilanUniverContext.howerAngels || { info: '', value: [] }),
          value: (bilanUniverContext.howerAngels?.value || []).slice(0, 10)
        },
        questionResponses: bilanUniverContext.questionResponses || { info: '', value: [] },
        computedAt: bilanUniverContext.computedAt
      };

      // Créer le texte de summaryContextHints avec l'univers tronqué
      const summaryContextHints = `CONTEXTE DE L'UNIVERS DE L'UTILISATEUR (limité aux 10 meilleurs résultats par catégorie pour éviter de surcharger):\n\n${JSON.stringify(truncatedUniverse, null, 2)}`;

      // Ajouter summaryContextHints aux métadonnées du contexte
      context = {
        ...context,
        metadata: {
          ...context.metadata,
          summaryContextHints
        }
      };
    }

    // Appeler la méthode parente pour générer le résumé
    const result = await super.generateConversationSummary(context);

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
          console.log("practice.id", practice.id, "will be set to", practice.title || practice.name || 'Pratique sans nom');
          practicesMap.set(practice.id, practice.title || practice.name || 'Pratique sans nom');
        }
      });
      
      (univers.activities.value || []).forEach((activity: any) => {
        if (activity.id) {
          console.log("activity.id", activity.id, "will be set to", activity.title || activity.name || 'Activité sans nom');
          activitiesMap.set(activity.id, activity.title || activity.name || 'Activité sans nom');
        }
      });

      // Enrichir les recommandations avec les noms
      if (result.summary && typeof result.summary === 'object' && !Array.isArray(result.summary)) {
        const summary = result.summary as any;
        
        // Enrichir recommendedCategories (pratiques)
        if (summary.recommendation?.recommendedCategories && Array.isArray(summary.recommendation.recommendedCategories)) {
          summary.recommendation.recommendedCategories = summary.recommendation.recommendedCategories.map((item: any) => {
            console.log("result will be", { ...item, name: practicesMap.get(item.id) || 'Pratique sans nom' });
            return { ...item, name: practicesMap.get(item.id) || 'Pratique sans nom' };
          });
        }
        
        // Enrichir recommendedActivities
        if (summary.recommendation?.recommendedActivities && Array.isArray(summary.recommendation.recommendedActivities)) {
          summary.recommendation.recommendedActivities = summary.recommendation.recommendedActivities.map((item: any) => {
            console.log("result will be", { ...item, name: activitiesMap.get(item.id) || 'Activité sans nom' });
            return { ...item, name: activitiesMap.get(item.id) || 'Activité sans nom' };
          });
        }
        
        // Enrichir top1Recommandation
        if (summary.recommendation?.top1Recommandation?.id) {
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

    console.log('💬 [BILAN] buildFinalResponse - questionIndex:', questionIndex);

    const currentQuestion = questionIndex >= 0 && questionIndex < BILAN_QUESTIONS.length 
      ? BILAN_QUESTIONS[questionIndex] 
      : null;

    if (!currentQuestion) {
      console.log('💬 [BILAN] buildFinalResponse - no currentQuestion');
      // Si pas de question trouvée, retourner la réponse IA telle quelle
      return aiResponse;
    }

    console.log('💬 [BILAN] buildFinalResponse - currentQuestion:', currentQuestion);

    // Construire la réponse finale : texte IA (toujours du texte dans ce cas) + saut de ligne + question
    const responseText = typeof aiResponse.response === 'string' 
      ? aiResponse.response 
      : String(aiResponse.response);
    const finalResponseText = responseText.trim() 
      ? `${responseText}\n\n${currentQuestion.question}`
      : currentQuestion.question;

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
   * Redéfinit onGenerateFirstAiResponse pour initialiser remainBilanQuestion et ajouter la première question
   */
  protected override async onGenerateFirstAiResponse(
    firstResponse: RecommendationMessageResponse,
    context: HowanaContext
  ): Promise<RecommendationMessageResponse> {

    context.metadata = {
      ...context.metadata,
      ['remainBilanQuestion']: BILAN_QUESTIONS.length
    };
    
    console.log(`📊 [BILAN] onGenerateFirstAiResponse - Initialisation de remainBilanQuestion à ${BILAN_QUESTIONS.length}`);
    
    // Mettre à jour le contexte dans la réponse
    firstResponse.updatedContext = context;
    
    // Construire la réponse finale avec la première question (index 0) et les quick replies
    return this.buildFinalResponse(firstResponse, 0);
  }

  /**
   * Redéfinit beforeAiResponseSend pour construire la réponse finale avec question et quick replies
   */
  protected override async beforeAiResponseSend(
    aiResponse: RecommendationMessageResponse, 
    context: HowanaContext
  ): Promise<RecommendationMessageResponse> {
    // Si la réponse est de type summary, ne rien faire
    if ((aiResponse as any).type === 'summary' || (aiResponse as any).message_type === 'summary') {
      return aiResponse;
    }
    
    // Récupérer la valeur actuelle de remainBilanQuestion
    const currentRemainQuestion = context.metadata?.['remainBilanQuestion'] as number | undefined;
    
    console.log('💬 [BILAN] beforeAiResponseSend:', currentRemainQuestion);
    
    // Si on est en mode questions de bilan (y compris la première réponse)
    if (currentRemainQuestion !== undefined && currentRemainQuestion > 0) {
      // Calculer l'index de la question actuelle
      // Si currentRemainQuestion === BILAN_QUESTIONS.length, alors index = 0 (première question)
      const currentQuestionIndex = BILAN_QUESTIONS.length - currentRemainQuestion;
      console.log('💬 [BILAN] beforeAiResponseSend - index:', currentQuestionIndex);
      // Construire la réponse finale avec la question et les quick replies
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
    
    console.log('💬 [BILAN] computeGlobalIntentInfos - previousQuestionIndex:', previousQuestionIndex);

    // Récupérer la question précédente directement depuis BILAN_QUESTIONS
    const previousQuestion = previousQuestionIndex >= 0 && previousQuestionIndex < BILAN_QUESTIONS.length
      ? BILAN_QUESTIONS[previousQuestionIndex]?.question
      : undefined;
    
    // Créer l'objet { question, index, response } pour la question actuelle
    // Parser la réponse : si c'est un entier, c'est un index, sinon c'est du texte custom (index = -1)
    let responseIndex = -1;
    if (userMessage) {
      const parsedIndex = parseInt(userMessage, 10);
      if (!isNaN(parsedIndex) && parsedIndex >= 0) {
        responseIndex = parsedIndex;
      }
    }
    
    // Convertir l'index en texte correspondant pour l'univers si c'est un index valide
    let responseText = userMessage || '';
    if (responseIndex >= 0 && previousQuestionIndex >= 0 && previousQuestionIndex < BILAN_QUESTIONS.length) {
      const questionData = BILAN_QUESTIONS[previousQuestionIndex];
      if (questionData && responseIndex < questionData.quickReplies.length) {
        const quickReply = questionData.quickReplies[responseIndex];
        if (quickReply) {
          responseText = quickReply.text;
        }
      }
    }
    
    const currentQuestionResponse: { question: string; index: number; response: string } | undefined = userMessage ? {
      question: previousQuestion!,
      index: responseIndex,
      response: responseText
    } : undefined;
    
    // Accumuler les questions-réponses précédentes avec la nouvelle
    const questionResponses: Array<{ question: string; index: number; response: string }> = 
      previousBilanUniverContext?.questionResponses?.value || [];
    
    console.log('💬 [BILAN] computeGlobalIntentInfos - previousBilanUniverContext.questionResponses.length:', questionResponses.length);

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
        chunks: universe.chunks,
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
    questionResponses?: Array<{ question: string; index: number; response: string }>,
    totalQuestions?: number,
    answeredQuestions?: number
  ): Promise<{
    families: {
      info: string;
      value: Array<{
        id: string;
        name: string;
        dominanceScore: number;
        dominancePercentage: number;
        practicesCount: number;
        activitiesCount: number;
        howerAngelsCount: number;
        matchCount: number;
        topPractices: Array<{ id: string; title: string; relevanceScore: number }>;
        topActivities: Array<{ id: string; title: string; relevanceScore: number }>;
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
      value: Array<{ question: string; index: number; response: string }>;
    };
    chunks: {
      info: string;
      value: BilanChunk[];
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
        questionResponses: { info: string; value: Array<{ question: string; index: number; response: string }> };
        chunks: { info: string; value: BilanChunk[] };
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
        },
        chunks: {
          info: 'Chunks typés extraits de l\'intent calculé à partir des réponses de l\'utilisateur. Chaque chunk représente un fragment sémantique identifié dans les réponses.',
          value: chunks
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
        questionResponses: { info: string; value: Array<{ question: string; index: number; response: string }> };
        chunks: { info: string; value: BilanChunk[] };
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
        },
        chunks: {
          info: 'Chunks typés extraits de l\'intent calculé à partir des réponses de l\'utilisateur. Chaque chunk représente un fragment sémantique identifié dans les réponses.',
          value: chunks
        }
      };
      return emptyResult;
    }
    
    console.log(`🔍 [BILAN] Calcul de l'univers avec ${allChunksTexts.length} chunks de texte`);
    
    // Réaliser les recherches sémantiques en parallèle avec withMatchInfos pour récupérer les chunks qui ont permis le matching
    // Les fonctions de recherche font maintenant le regroupement et le tri en interne
    const [practicesResults, activitiesResults, howerAngelsResult] = await Promise.all([
      this.supabaseService.searchPracticesBySituationChunks(allChunksTexts, true), // withMatchInfos = true
      this.supabaseService.searchActivitiesBySituationChunks(allChunksTexts, true), // withMatchInfos = true
      this.supabaseService.searchHowerAngelsByUserSituation(allChunksTexts, 10, true) // withMatchInfos = true
    ]);
    
    const practices: PracticeSearchResult[] = practicesResults.results || [];
    const activities: ActivitySearchResult[] = activitiesResults.results || [];
    const howerAngels: HowerAngelSearchResult[] = howerAngelsResult.success ? (howerAngelsResult.data || []) : [];
    
    console.log(`✅ [BILAN] ${practices.length} pratiques, ${activities.length} activités et ${howerAngels.length} hower angels trouvés`);
    
    // Extraire les familles directement depuis les résultats de recherche (plus besoin de requêtes supplémentaires)
    const familyIds = new Set<string>();
    const familiesMap = new Map<string, { id: string; name: string; description?: string | undefined }>(); // familyId -> {id, name, description}
    const practiceFamilyMap = new Map<string, string>(); // practiceId -> familyId
    const activityFamilyMap = new Map<string, string>(); // activityId -> familyId
    const familyMatchCount = new Map<string, number>(); // familyId -> nombre total de matchs
    
    // Extraire les familles depuis les pratiques et compter les matchs
    // Une pratique qui a matché X fois contribue pour X à sa famille
    practices.forEach((practice: PracticeSearchResult) => {
      if (practice.familyId) {
        familyIds.add(practice.familyId);
        practiceFamilyMap.set(practice.id, practice.familyId);
        
        // Compter les matchs pour cette famille (via cette pratique)
        // Utiliser le matchCount de la pratique (qui peut être > 1 si elle a matché plusieurs fois)
        const matchCount = practice.matchCount || 1;
        const currentFamilyCount = familyMatchCount.get(practice.familyId) || 0;
        familyMatchCount.set(practice.familyId, currentFamilyCount + matchCount);
        
        // Stocker les informations de la famille si disponibles
        if (practice.familyName) {
          const familyInfo: { id: string; name: string; description?: string } = {
            id: practice.familyId,
            name: practice.familyName
          };
          if (practice.familyDescription) {
            familyInfo.description = practice.familyDescription;
          }
          familiesMap.set(practice.familyId, familyInfo);
        }
      }
    });
    
    // Extraire les familles depuis les activités (uniquement pour le mapping, pas pour le comptage)
    // Les activités ne contribuent PAS au comptage des familles car elles dépendent des utilisateurs
    // et peuvent biaiser les statistiques. Seules les pratiques (fixes) contribuent.
    activities.forEach((activity: ActivitySearchResult) => {
      if (activity.familyId) {
        // On garde le mapping pour référence, mais on ne compte pas les matchs
        activityFamilyMap.set(activity.id, activity.familyId);
        
        // Stocker les informations de la famille si disponibles (uniquement si pas déjà présente)
        if (activity.familyName && !familiesMap.has(activity.familyId)) {
          const familyInfo: { id: string; name: string; description?: string } = {
            id: activity.familyId,
            name: activity.familyName
          };
          if (activity.familyDescription) {
            familyInfo.description = activity.familyDescription;
          }
          familiesMap.set(activity.familyId, familyInfo);
        }
      }
    });
    
    // Convertir la Map en Array pour compatibilité avec le code existant
    const familiesData: Array<{ id: string; name: string }> = Array.from(familiesMap.values());
    
    // Calculer la dominance des familles (uniquement basée sur les pratiques)
    const familyDominance = new Map<string, {
      id: string;
      name: string;
      practicesCount: number;
      practicesScore: number; // Somme des scores de pertinence des pratiques
      matchCount: number; // Nombre total de matchs pour cette famille
    }>();
    
    // Initialiser toutes les familles
    familiesData.forEach(family => {
      familyDominance.set(family.id, {
        id: family.id,
        name: family.name,
        practicesCount: 0,
        practicesScore: 0,
        matchCount: familyMatchCount.get(family.id) || 0
      });
    });
    
    // Compter les pratiques par famille (seules les pratiques comptent pour la dominance)
    // Une pratique qui a matché X fois contribue pour X à sa famille
    practices.forEach((practice: PracticeSearchResult) => {
      const familyId = practiceFamilyMap.get(practice.id);
      if (familyId) {
        const family = familyDominance.get(familyId);
        if (family) {
          const matchCount = practice.matchCount || 1;
          family.practicesCount += matchCount; // Contribue pour X si elle a matché X fois
          family.practicesScore += (practice.relevanceScore || 0) * matchCount; // Score multiplié par le nombre de matchs
        }
      }
    });
    
    // Calculer le score de dominance global pour chaque famille
    // Le score est uniquement basé sur les pratiques
    const familiesWithDominance = Array.from(familyDominance.values()).map(family => {
      // Score de dominance = practicesScore (uniquement les pratiques)
      const dominanceScore = family.practicesScore;
      
      return {
        id: family.id,
        name: family.name,
        dominanceScore,
        practicesCount: family.practicesCount,
        activitiesCount: 0, // Ne compte plus pour la dominance
        howerAngelsCount: 0, // Ne compte plus pour la dominance
        matchCount: family.matchCount // Nombre total de matchs pour identifier les tendances
      };
    });
    
    // Trier par score de dominance décroissant
    familiesWithDominance.sort((a, b) => b.dominanceScore - a.dominanceScore);
    
    // Calculer les pourcentages de dominance (somme = 100%)
    const totalDominanceScore = familiesWithDominance.reduce((sum, family) => sum + family.dominanceScore, 0);
    const familiesWithPercentage = familiesWithDominance.map(family => {
      const dominancePercentage = totalDominanceScore > 0 
        ? (family.dominanceScore / totalDominanceScore) * 100 
        : 0;
      
      return {
        ...family,
        dominancePercentage: Math.round(dominancePercentage * 100) / 100 // Arrondir à 2 décimales
      };
    });
    
    // Ajuster le dernier pourcentage pour que la somme fasse exactement 100%
    if (familiesWithPercentage.length > 0 && totalDominanceScore > 0) {
      const sum = familiesWithPercentage.reduce((s, f) => s + f.dominancePercentage, 0);
      const diff = 100 - sum;
      if (Math.abs(diff) > 0.01) { // Si la différence est significative (> 0.01%)
        const lastFamily = familiesWithPercentage[familiesWithPercentage.length - 1];
        if (lastFamily) {
          lastFamily.dominancePercentage = 
            Math.round((lastFamily.dominancePercentage + diff) * 100) / 100;
        }
      }
    }
    
    console.log(`📊 [BILAN] Classement de ${familiesWithPercentage.length} familles par dominance:`, 
      familiesWithPercentage.map(f => `${f.name} (${f.dominanceScore.toFixed(2)}, ${f.dominancePercentage.toFixed(2)}%, ${f.matchCount} matchs)`).join(', '));
    
    // Vérifier que la somme des pourcentages fait bien 100%
    const totalPercentage = familiesWithPercentage.reduce((sum, f) => sum + f.dominancePercentage, 0);
    console.log(`📊 [BILAN] Somme des pourcentages: ${totalPercentage.toFixed(2)}%`);
    
    // Grouper les pratiques et activités par famille pour calculer le top 4
    const practicesByFamily = new Map<string, PracticeSearchResult[]>();
    const activitiesByFamily = new Map<string, ActivitySearchResult[]>();
    
    // Grouper les pratiques par famille
    practices.forEach((practice: PracticeSearchResult) => {
      const familyId = practiceFamilyMap.get(practice.id);
      if (familyId) {
        const familyPractices = practicesByFamily.get(familyId) || [];
        familyPractices.push(practice);
        practicesByFamily.set(familyId, familyPractices);
      }
    });
    
    // Grouper les activités par famille
    activities.forEach((activity: ActivitySearchResult) => {
      const familyId = activityFamilyMap.get(activity.id);
      if (familyId) {
        const familyActivities = activitiesByFamily.get(familyId) || [];
        familyActivities.push(activity);
        activitiesByFamily.set(familyId, familyActivities);
      }
    });
    
    // Ajouter le top 4 des pratiques et activités à chaque famille
    const familiesWithTopItems = familiesWithPercentage.map(family => {
      // Top 4 des pratiques pour cette famille (triées par relevanceScore décroissant)
      const familyPractices = practicesByFamily.get(family.id) || [];
      const topPractices = familyPractices
        .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        .slice(0, 4)
        .map(practice => ({
          id: practice.id,
          title: practice.title,
          relevanceScore: practice.relevanceScore
        }));
      
      // Top 4 des activités pour cette famille (triées par relevanceScore décroissant)
      const familyActivities = activitiesByFamily.get(family.id) || [];
      const topActivities = familyActivities
        .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        .slice(0, 4)
        .map(activity => ({
          id: activity.id,
          title: activity.title,
          relevanceScore: activity.relevanceScore
        }));
      
      return {
        ...family,
        topPractices,
        topActivities
      };
    });
    
    // Enrichir les pratiques et activités avec les chunks qui ont permis le matching
    // chunkText contient le fragment de chunk de la base de données qui a matché
    // matchCount est déjà présent dans les pratiques et activités après déduplication
    const practicesWithMatchCount = practices.map((practice: PracticeSearchResult) => ({
      ...practice,
      matchingChunks: practice.chunkText || null // Fragment de chunk de la BD qui a permis le matching
    }));
    
    const activitiesWithMatchCount = activities.map((activity: ActivitySearchResult) => ({
      ...activity,
      matchingChunks: activity.chunkText || null // Fragment de chunk de la BD qui a permis le matching
    }));
    
    // Enrichir les hower angels avec les chunks qui ont permis le matching
    const howerAngelsWithChunks = howerAngels.map((howerAngel: HowerAngelSearchResult) => ({
      ...howerAngel,
      matchingChunks: howerAngel.chunkText || null // Fragment de chunk de la BD qui a permis le matching
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
          dominancePercentage: number;
          practicesCount: number;
          activitiesCount: number;
          howerAngelsCount: number;
          matchCount: number;
          topPractices: Array<{ id: string; title: string; relevanceScore: number }>;
          topActivities: Array<{ id: string; title: string; relevanceScore: number }>;
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
        value: Array<{ question: string; index: number; response: string }>;
      };
      chunks: {
        info: string;
        value: BilanChunk[];
      };
    } = {
      families: {
        info: 'Liste des familles de pratiques bien-être identifiées à partir des réponses de l\'utilisateur, classées par score de dominance. Chaque famille représente un domaine de bien-être (ex: méditation, yoga, sophrologie, etc.) et contient le nombre de pratiques, activités et hower angels associés, ainsi qu\'un pourcentage de dominance (somme = 100%). Chaque famille inclut également le top 4 des pratiques et activités associées, triées par score de pertinence.',
        value: familiesWithTopItems
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
        value: howerAngelsWithChunks
      },
      questionResponses: {
        info: questionResponsesInfo,
        value: questionResponses || []
      },
      chunks: {
        info: 'Chunks typés extraits de l\'intent calculé à partir des réponses de l\'utilisateur. Chaque chunk représente un fragment sémantique identifié dans les réponses.',
        value: chunks
      }
    };
    
    return result;
  }

  /**
   * Valide une réponse IA générée
   * @param response La réponse IA à valider
   * @param context Le contexte de la conversation
   * @returns Un objet contenant isValid (boolean), reason (string optionnel) et finalObject (T optionnel)
   */
  protected async validateResponse(
    response: RecommendationMessageResponse, 
    context: HowanaContext
  ): Promise<{
    isValid: boolean;
    reason?: string;
    finalObject?: RecommendationMessageResponse;
  }> {
    // Validation de base : vérifier que la réponse contient le champ response
    if (!response || !response.response) {
      return {
        isValid: false,
        reason: 'La réponse ne contient pas le champ "response" requis'
      };
    }

    // Validation de base : vérifier que la réponse n'est pas vide
    if (typeof response.response !== 'string' || response.response.trim().length === 0) {
      return {
        isValid: false,
        reason: 'La réponse est vide'
      };
    }

    // Vérifier les IDs des quickReplies si présents
    if (response.quickReplies && Array.isArray(response.quickReplies) && response.quickReplies.length > 0) {
      // Regexp pour extraire un UUID valide depuis une chaîne (même avec d'autres caractères)
      // Format UUID: "d1e210f7-3f60-4151-83b5-12ec51e21b67"
      const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      
      // Récupérer le globalIntentInfos depuis le contexte pour vérifier les IDs
      const globalIntentInfos = context.metadata?.['globalIntentInfos'] as GlobalRecommendationIntentInfos | undefined;
      
      if (!globalIntentInfos) {
        return {
          isValid: false,
          reason: 'Impossible de valider les quickReplies : globalIntentInfos non disponible dans le contexte'
        };
      }

      // Créer des Sets pour vérifier rapidement l'existence des IDs
      // Activities : depuis globalIntentInfos.activities ET depuis howerAngels[].activities
      const activityIds = new Set(globalIntentInfos.activities.map(a => a.id));
      globalIntentInfos.howerAngels.forEach(howerAngel => {
        if (howerAngel.activities) {
          howerAngel.activities.forEach(activity => {
            if (activity.id) {
              activityIds.add(activity.id);
            }
          });
        }
      });

      // Practices : depuis globalIntentInfos.practices ET depuis howerAngels[].specialties
      const practiceIds = new Set(globalIntentInfos.practices.map(p => p.id));
      globalIntentInfos.howerAngels.forEach(howerAngel => {
        if (howerAngel.specialties) {
          howerAngel.specialties.forEach(specialty => {
            if (specialty.id) {
              practiceIds.add(specialty.id);
            }
          });
        }
      });

      const howerAngelUserIds = new Set(globalIntentInfos.howerAngels.map(h => h.userId));

      // Copie de la réponse pour modification si nécessaire
      const correctedResponse: RecommendationMessageResponse = { 
        ...response,
        quickReplies: response.quickReplies.map(qr => ({ ...qr }))
      };
      let hasCorrections = false;

      // Vérifier chaque quickReply
      for (let i = 0; i < response.quickReplies.length; i++) {
        const quickReply = response.quickReplies[i];
        
        if (!quickReply) {
          continue;
        }
        
        const correctedQuickReply = correctedResponse.quickReplies[i];
        if (!correctedQuickReply) {
          continue;
        }
        
        // Vérifier activityId si présent
        if (quickReply.activityId) {
          const originalActivityId = quickReply.activityId;
          const trimmedId = originalActivityId.trim();
          
          // Essayer d'extraire un UUID valide depuis la chaîne
          const uuidMatch = trimmedId.match(uuidRegex);
          if (!uuidMatch) {
            return {
              isValid: false,
              reason: `Impossible d'extraire un activityId valide (format UUID) depuis "${trimmedId}" dans la quickReply ${i + 1}`
            };
          }
          
          const activityId = uuidMatch[0];
          
          // Vérifier l'existence dans le contexte
          if (!activityIds.has(activityId)) {
            return {
              isValid: false,
              reason: `L'activityId "${activityId}" dans la quickReply ${i + 1} n'existe pas dans le contexte`
            };
          }
          
          // Corriger l'ID si nécessaire (utiliser l'UUID extrait)
          if (originalActivityId !== activityId) {
            correctedQuickReply.activityId = activityId;
            hasCorrections = true;
          }
        }

        // Vérifier practiceId si présent
        if (quickReply.practiceId) {
          const originalPracticeId = quickReply.practiceId;
          const trimmedId = originalPracticeId.trim();
          
          // Essayer d'extraire un UUID valide depuis la chaîne
          const uuidMatch = trimmedId.match(uuidRegex);
          if (!uuidMatch) {
            return {
              isValid: false,
              reason: `Impossible d'extraire un practiceId valide (format UUID) depuis "${trimmedId}" dans la quickReply ${i + 1}`
            };
          }
          
          const practiceId = uuidMatch[0];
          
          // Vérifier l'existence dans le contexte
          if (!practiceIds.has(practiceId)) {
            return {
              isValid: false,
              reason: `Le practiceId "${practiceId}" dans la quickReply ${i + 1} n'existe pas dans le contexte`
            };
          }
          
          // Corriger l'ID si nécessaire (utiliser l'UUID extrait)
          if (originalPracticeId !== practiceId) {
            correctedQuickReply.practiceId = practiceId;
            hasCorrections = true;
          }
        }

        // Vérifier les autres types de quickReplies qui pourraient avoir des IDs
        // (par exemple howerAngelId pour les quickReplies de type 'hower_angel_rdv')
        const quickReplyAny = quickReply as any;
        const correctedQuickReplyAny = correctedQuickReply as any;
        if (quickReplyAny.howerAngelId) {
          const originalHowerAngelId = String(quickReplyAny.howerAngelId);
          const trimmedId = originalHowerAngelId.trim();
          
          // Essayer d'extraire un UUID valide depuis la chaîne
          const uuidMatch = trimmedId.match(uuidRegex);
          if (!uuidMatch) {
            return {
              isValid: false,
              reason: `Impossible d'extraire un howerAngelId valide (format UUID) depuis "${trimmedId}" dans la quickReply ${i + 1}`
            };
          }
          
          const howerAngelId = uuidMatch[0];
          
          // Vérifier l'existence dans le contexte
          if (!howerAngelUserIds.has(howerAngelId)) {
            return {
              isValid: false,
              reason: `Le howerAngelId "${howerAngelId}" dans la quickReply ${i + 1} n'existe pas dans le contexte`
            };
          }
          
          // Corriger l'ID si nécessaire (utiliser l'UUID extrait)
          if (originalHowerAngelId !== howerAngelId) {
            correctedQuickReplyAny.howerAngelId = howerAngelId;
            hasCorrections = true;
          }
        }
      }

      // Si des corrections ont été faites, retourner la réponse corrigée
      if (hasCorrections) {
        return {
          isValid: true,
          finalObject: correctedResponse
        };
      }
    }

    // Toutes les validations sont passées
    return {
      isValid: true
    };
  }

}
