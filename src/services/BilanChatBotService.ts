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
  {
    question: "📍 Où souhaites-tu découvrir tes praticiens ?",
    quickReplies: [
      { text: "📍 Utiliser ma géolocalisation", icon: "explore" },
      { text: "✏️ Saisir ma ville / code postal", icon: "explore" }
    ]
  }
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
   * Redéfinit handleIntent pour décrémenter le nombre de questions restantes
   */
  protected override async handleIntent(
    context: HowanaContext,
    userMessage: string,
    onIaResponse: (response: any) => Promise<void>
  ): Promise<HowanaContext> {
    // Récupérer le nombre de questions restantes
    const remainBilanQuestion = context.metadata?.['remainBilanQuestion'] as number | undefined;
    
    // Décrémenter si supérieur à 0
    if (remainBilanQuestion !== undefined && remainBilanQuestion > 0) {
      const newRemainQuestion = remainBilanQuestion - 1;
      context.metadata = {
        ...context.metadata,
        ['remainBilanQuestion']: newRemainQuestion
      };
      console.log(`📉 [BILAN] Décrémentation de remainBilanQuestion: ${remainBilanQuestion} -> ${newRemainQuestion}`);
    }
    
    // Appeler la méthode parente pour le reste du traitement
    return super.handleIntent(context, userMessage, onIaResponse);
  }

  /**
   * Fonction centralisée pour toutes les informations de contexte système
   */
  protected override async getSystemContext(context: any): Promise<string> {
    let contextInfo = '';

    // Contexte du bilan
    contextInfo += this.getDetailedBilanInfo(context);
    
    contextInfo += this.getLastBilanContextInfo(context);

    // Contexte de la dernière recommandation Howana
    contextInfo += this.getPreviousConversationContext(context as any);
    // Ajouter les pratiques HOW PASS existantes
    contextInfo += (await this.getAvailablePracticesContext());

    return contextInfo;
  }
  /**
   * Informations détaillées du bilan
   */
  protected getDetailedBilanInfo(context: HowanaBilanContext & HowanaContext): string {
    if (!context.bilanData) return '';

    let bilanInfo = `\n\nINFORMATIONS DU PRE-BILAN DISPONIBLES:
    - Confort physique: ${context.bilanData.scores.principaux.confortPhysique}/9
    - Équilibre émotionnel: ${context.bilanData.scores.principaux.equilibreEmotionnel}/9
    - Qualité du sommeil: ${context.bilanData.scores.principaux.qualiteSommeil}/9
    - Niveau d'énergie: ${context.bilanData.scores.principaux.niveauEnergie}/9`;
    
    if (context.bilanData.douleurs) {
      bilanInfo += `\n- Douleurs: ${context.bilanData.douleurs}`;
    }
    
    return bilanInfo;
  
  }

  protected override getSummaryOutputSchema(context: HowanaContext): any {
    const constraints = this.getActivitiesAndPracticesConstraints(context);
    const { availableActivityIds, availablePracticeIds, availableActivityNames, availablePracticeNames, allAvailableIds } = constraints;

    console.log(`📋 [BILANS] Contraintes générées avec ${availableActivityIds.length} activités et ${availablePracticeIds.length} pratiques:`, {
      availableActivityIds,
      availablePracticeIds,
      availableActivityNames,
      availablePracticeNames,
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
            bilanAnalysis: {
              type: "object",
              properties: {
                scoresAnalysis: {
                  type: "string",
                  description: "Message destiné à l'utilisateur analysant vos scores de bilan et identifiant vos points d'amélioration (formulé en vous parlant directement l'un a l'autre)"
                },
                customCategories: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      categoryKey: {
                        type: "string",
                        description: "Identifiant unique de la catégorie personnalisée"
                      },
                      categoryName: {
                        type: "string",
                        description: "Nom de la catégorie personnalisée identifiée"
                      },
                      score: {
                        type: "number",
                        description: "Score de 1 à 9 pour cette catégorie"
                      },
                      description: {
                        type: "string",
                        description: "Message destiné à l'utilisateur décrivant cette catégorie et pourquoi elle est importante pour vous (formulé en vous parlant directement l'un a l'autre)"
                      }
                    },
                    required: ["categoryKey", "categoryName", "score", "description"],
                    additionalProperties: false
                  },
                  description: "Catégories personnalisées identifiées lors de votre conversation avec leurs scores. Soit le score a été explicitement donné par l'utilisateur, soit analysé à partir de l'échange"
                }
              },
              required: ["scoresAnalysis", "customCategories"],
              additionalProperties: false
            },
            recommendation: this.getRecommendationSchemaFragment(
              availableActivityIds,
              availableActivityNames,
              availablePracticeIds,
              availablePracticeNames,
              "Recommandation personnalisée basée sur l'analyse du bilan de bien-être"
            ),
            importanteKnowledge: {
              type: "array",
              items: { type: "string" },
              description: "Messages destinés à l'utilisateur contenant les points clés à retenir pour optimiser votre parcours de bien-être (formulés en vous parlant directement)"
            }
          },
          required: ["userProfile", "bilanAnalysis", "recommendation", "importanteKnowledge"],
          additionalProperties: false,
          description: `Résumé personnalisé de votre bilan de bien-être avec recommandations adaptées. Les recommandations sont contraintes aux ${allAvailableIds.length} éléments disponibles dans le contexte.`
        },
        strict: true
      }
    };
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
      // Description demandant seulement l'analyse de l'univers (sans la question, sans quickReplies)
      const description = `Message conversationnel court (≤ 30 mots) contenant UNIQUEMENT une analyse de l'univers détecté et les points intéressants qui en ressortent.

L'analyse doit être naturelle et intégrée dans la conversation, pas une simple liste. Analyse les réponses précédentes de l'utilisateur pour identifier et mentionner les domaines, familles ou pratiques qui ressortent le plus. Exemple : "Je remarque que tu es particulièrement intéressé par [domaine principal identifié]." ou "Je vois que [point intéressant] ressort dans tes réponses."

IMPORTANT : 
- Le message doit rester court (≤ 30 mots) et conversationnel
- Analyse l'univers et ressort les points intéressants de manière naturelle
- Ne liste pas simplement les familles, mais fais une observation basée sur ce qui ressort
- N'inclus PAS de question dans ce message, seulement l'analyse de l'univers`;
      
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
   */
  public override async generateFirstResponse(context: HowanaContext): Promise<RecommendationMessageResponse> {
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
  protected override getIntentSchema(context: HowanaContext): ChatBotOutputSchema {
    const remainBilanQuestion = context.metadata?.['remainBilanQuestion'] as number | undefined;
    
    // Si on est encore dans les réponses aux questions, utiliser le schéma de chunks typés
    if (remainBilanQuestion !== undefined && remainBilanQuestion > 0) {
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
    
    // Sinon, utiliser le schéma du parent (RecommendationChatBotService)
    return super.getIntentSchema(context);
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
    // Vérifier si c'est un intent de type bilan_question
    if (intent?.type === "bilan_question") {
      // Récupérer le bilanUniverContext précédent depuis les métadonnées
      const previousBilanUniverContext = context.metadata?.['globalIntentInfos']?.bilanUniverContext as {
        families?: { info?: string; value?: any[] };
        practices?: { info?: string; value?: any[] };
        activities?: { info?: string; value?: any[] };
        howerAngels?: { info?: string; value?: any[] };
        questionResponses?: { info?: string; value?: Array<{ question?: string; response: string }> };
        computedAt?: string;
      } | undefined;
      
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
    
    // Sinon, utiliser le comportement du parent (sans userMessage pour compatibilité)
    return super.computeGlobalIntentInfos(intent, context);
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
