
import { HowanaBilanContext, HowanaContext, HowanaRecommandationContext } from '../types/repositories';
import { ChatBotOutputSchema, ExtractedRecommandations, GlobalRecommendationIntentInfos, OpenAIToolsDescription, RecommendationIntent, RecommendationMessageResponse, BilanSummary, BilanRecommendation, ActivityItem, PracticeItem, HowerAngelItem } from '../types';
import {
  BilanChunk,
  BilanQuestionIntent,
  BilanUniverContext,
  BilanFamily,
  BilanQuestionnaireWithChunks,
  BilanQuestionnaireUserAnswers,
  BilanQuestionnaireUserMessage,
  BilanQuestionnaireAnswers,
  INITIAL_BILAN_QUESTIONS,
  BILAN_ERROR_MESSAGES,
  AnimalResponseStatus
} from '../types/bilan';
import {
  PracticeSearchResult,
  ActivitySearchResult,
  HowerAngelSearchResult
} from '../types/search';
import { BaseChatBotService } from './BaseChatBotService';
import { HowerAngelService, HowerAngelWithDistance, DistanceResult } from './HowerAngelService';
import { PracticeService } from './PracticeService';
import { ActivityService } from './ActivityService';
import * as crypto from 'crypto';

export class BilanChatBotService extends BaseChatBotService<RecommendationMessageResponse> {
  protected howerAngelService: HowerAngelService;
  protected practiceService: PracticeService;
  protected activityService: ActivityService;

  constructor() {
    super();
    this.howerAngelService = new HowerAngelService();
    this.practiceService = new PracticeService();
    this.activityService = new ActivityService();
  }
  
  /**
   * Calcule l'intent pour la première réponse en utilisant computeIntent avec les réponses du questionnaire
   */
  public override async computeFirstResponseIntent(context: HowanaContext, userInputText?: string | null): Promise<{
    intent: BilanQuestionIntent|null;
    intentCost: number | null;
    globalIntentInfos: any;
  }> {
    // Parser directement userInputText pour récupérer les réponses au questionnaire
    let questionnaireData: BilanQuestionnaireUserAnswers | undefined;

    // Parser userInputText comme questionnaireAnswers
    if (userInputText) {
      try {
        const parsed = JSON.parse(userInputText) as BilanQuestionnaireUserAnswers;
        if (parsed && typeof parsed === 'object' && parsed.mode && parsed.answers && Array.isArray(parsed.answers)) {
          questionnaireData = parsed;
          
          // Mettre les données parsées dans context.metadata
          context.metadata = {
            ...context.metadata,
            questionnaireAnswers: questionnaireData
          };
        }
      } catch (parseError) {
        // Si ce n'est pas du JSON valide, on continue sans questionnaireAnswers
        console.log('⚠️ [BILAN] userInputText n\'est pas du JSON valide pour questionnaireAnswers');
      }
    }

    // Extraire les réponses et le mode
    const questionnaireAnswers = questionnaireData?.answers;
    const mode = questionnaireData?.mode || 'init';

    // Si on a des réponses au questionnaire, calculer l'intent avec computeIntent
    if (questionnaireAnswers && questionnaireAnswers.length > 0) {
      console.log(`📋 [BILAN] computeFirstResponseIntent - ${questionnaireAnswers.length} réponses au questionnaire détectées (mode: ${mode})`);
      
      // Convertir les réponses en format bilan_answers
      const bilanAnswers = questionnaireAnswers.map(answer => ({
        questionIndex: answer.questionIndex,
        answerIndex: answer.answerIndex,
        answerText: answer.answerText,
        ...(answer.moreResponse && {
          moreResponse: answer.moreResponse,
          moreResponseType: answer.moreResponseType || 'text'
        })
      }));
      
      // Construire le message au format bilan_answers avec le mode
      const userMessage = JSON.stringify({
        type: 'bilan_answers',
        mode: mode,
        answers: bilanAnswers
      });
      
      // Calculer l'intent avec les réponses (cela calculera les chunks)
      const intentResult = await this.computeIntent(context, userMessage);
      const intent = intentResult.intent as BilanQuestionIntent;
      
      // Calculer globalIntentInfos (cela calculera l'univers)
      const globalIntentInfos = await this.computeGlobalIntentInfos(intent, context, userMessage);
      
      return {
        intent: intent,
        intentCost: intentResult.intentCost,
        globalIntentInfos: globalIntentInfos
      };
    }

    // Si pas de réponses au questionnaire, retourner null (pas d'intent calculé)
    return { intent: null, intentCost: null, globalIntentInfos: null };
  }

  /**
   * Redéfinit generateFirstResponse pour gérer les réponses du questionnaire
   * Si questionnaireAnswers est présent, on génère directement le summary
   * Note: L'intent et globalIntentInfos sont déjà calculés par computeFirstResponseIntent
   */
  public override async generateFirstResponse(context: HowanaContext, _userInputText?: string | null): Promise<RecommendationMessageResponse> {
    
    // Vérifier si l'intent a été calculé (via computeFirstResponseIntent)
    const currentIntentInfos = context.metadata?.['currentIntentInfos'] as any;
    const intent = currentIntentInfos?.intent as BilanQuestionIntent | undefined;
    
    // Si on a un intent de type bilan_question, cela signifie qu'on a des réponses au questionnaire
    if (intent && intent.type === 'bilan_question') {
      console.log(`📋 [BILAN] generateFirstResponse - Intent détecté, génération directe du summary`);
      
      // Récupérer les réponses depuis le contexte (déjà parsées par computeFirstResponseIntent)
      const questionnaireData = context.metadata?.['questionnaireAnswers'] as BilanQuestionnaireUserAnswers | undefined;
      
      // Extraire les réponses et le mode
      const questionnaireAnswers = questionnaireData?.answers;
      const mode = questionnaireData?.mode || 'init';

      if (questionnaireAnswers && questionnaireAnswers.length > 0) {
        // Récupérer le questionnaire courant pour filtrer les réponses de type "address"
        const currentQuestionnaire = this.getCurrentQuestionnaire(context);
        
        // Convertir les réponses en format bilan_answers et filtrer celles de type "address"
        const bilanAnswers = questionnaireAnswers
          .map(answer => ({
            questionIndex: answer.questionIndex,
            answerIndex: answer.answerIndex,
            answerText: answer.answerText,
            ...(answer.moreResponse && {
              moreResponse: answer.moreResponse,
              moreResponseType: answer.moreResponseType || 'text'
            })
          }))
          .filter(answer => {
            // Filtrer les réponses de type "address" ou "takeGeoloc"
            const questionData = answer.questionIndex >= 0 && answer.questionIndex < currentQuestionnaire.length
              ? currentQuestionnaire[answer.questionIndex]
              : null;
            
            if (questionData) {
              // Vérifier si la question a une quickReply avec answerType "address", "takeGeoloc" ou "homeAddress"
              if (answer.answerIndex !== null && answer.answerIndex >= 0 && answer.answerIndex < questionData.quickReplies.length) {
                const quickReply = questionData.quickReplies[answer.answerIndex];
                if (quickReply && (quickReply.answerType === 'address' || quickReply.answerType === 'takeGeoloc' || quickReply.answerType === 'homeAddress')) {
                  return false; // Exclure cette réponse
                }
              }
              // Vérifier aussi si moreResponseType est "address" ou "gps"
              if ((answer as any).moreResponseType === 'address' || (answer as any).moreResponseType === 'gps') {
                return false; // Exclure cette réponse
              }
            }
            return true; // Inclure cette réponse
          });
        
        // Construire le message au format bilan_answers avec le mode (sans les réponses de type address)
        const userMessage = JSON.stringify({
          type: 'bilan_answers',
          mode: mode,
          answers: bilanAnswers
        });
        
        // Si des réponses custom sont présentes, appeler handleIntent pour calculer les chunks
        // Exclure les réponses de type "address" ou "takeGeoloc" qui ne sont pas des réponses custom
        const hasCustomResponses = bilanAnswers.some(answer => {
          // Si answerIndex est null, vérifier si c'est une question de type address
          if (answer.answerIndex === null) {
            const questionData = answer.questionIndex >= 0 && answer.questionIndex < currentQuestionnaire.length
              ? currentQuestionnaire[answer.questionIndex]
              : null;
            // Si la question a une quickReply avec answerType "address", "takeGeoloc" ou "homeAddress", ce n'est pas custom
            if (questionData && questionData.quickReplies.some((qr: any) => 
              qr.answerType === 'address' || qr.answerType === 'takeGeoloc' || qr.answerType === 'homeAddress'
            )) {
              return false; // Ce n'est pas une réponse custom
            }
            return true; // C'est une réponse custom
          }
          // Si moreResponse est présent, vérifier si c'est de type "address" ou "gps"
          if (answer.moreResponse) {
            const moreResponseType = (answer as any).moreResponseType;
            if (moreResponseType === 'address' || moreResponseType === 'gps') {
              return false; // Ce n'est pas une réponse custom
            }
            return true; // C'est une réponse custom
          }
          return false; // Pas de réponse custom
        });
        
        if (hasCustomResponses) {
          console.log('🔄 [BILAN] Réponses custom détectées, appel de handleIntent');
          await this.handleIntent(context, userMessage, async () => {}, false, undefined, false);
        }
      
        // Générer le summary en utilisant la méthode de la classe parente
        console.log('🔍 [BILAN] Génération du summary via generateConversationSummary');
        const summaryResult = await this.generateConversationSummary(context, true); // firstCall = true car c'est le premier appel
        
        // Adapter le format de retour pour correspondre à RecommendationMessageResponse
        const summaryText = typeof summaryResult.summary === 'string' 
          ? summaryResult.summary 
          : JSON.stringify(summaryResult.summary);
        
        return {
          response: summaryText,
          messageId: summaryResult.updatedContext.previousCallId || `summary-${Date.now()}`,
          updatedContext: summaryResult.updatedContext,
          extractedData: summaryResult.extractedData,
          cost_input: summaryResult.cost_input,
          cost_cached_input: summaryResult.cost_cached_input,
          cost_output: summaryResult.cost_output,
          haveNext: false,
          quickReplies: [] // Pas de quick replies pour un summary
        } as RecommendationMessageResponse;
      }
    }
        
    console.error('❌ [BILAN] Erreur lors de la génération de la première réponse');

    // Si on arrive ici, c'est qu'il y a eu une erreur
    // On renvoie un message d'erreur avec une variation aléatoire
    const randomErrorIndex = Math.floor(Math.random() * BILAN_ERROR_MESSAGES.length);
    const errorMessage = BILAN_ERROR_MESSAGES[randomErrorIndex];
    
    return {
      response: errorMessage,
      messageId: `error-${Date.now()}`,
      updatedContext: context,
      quickReplies: []
    } as RecommendationMessageResponse;
  }
  
  /**
   * Calcule un hash MD5 d'un questionnaire pour détecter les doublons
   * Le hash est basé uniquement sur les questions
   */
  protected calculateQuestionnaireHash(questionnaire: BilanQuestionnaireWithChunks): string {
    // Créer une représentation simplifiée du questionnaire avec uniquement les questions
    const questionsOnly = questionnaire.map(q => q.question);
    
    // Convertir en JSON et calculer le hash
    const jsonString = JSON.stringify(questionsOnly);
    return crypto.createHash('md5').update(jsonString).digest('hex');
  }
  
  /**
   * Convertit un questionnaire sans chunks en questionnaire avec chunks (chunks vides)
   * Utilisé pour convertir les questionnaires reçus depuis l'IA
   */
  protected convertQuestionnaireToWithChunks(questionnaire: Array<{
    question: string;
    quickReplies: Array<{ text: string; icon?: string }>;
  }>): BilanQuestionnaireWithChunks {
    return questionnaire.map(q => ({
      question: q.question,
      quickReplies: q.quickReplies.map(qr => ({
        text: qr.text,
        ...(qr.icon && { icon: qr.icon }),
        chunks: [] // Chunks vides pour les questionnaires reçus depuis l'IA
      }))
    }));
  }

  /**
   * Obtient le questionnaire courant depuis l'univers ou utilise INITIAL_BILAN_QUESTIONS par défaut
   * Si questionnaires[] existe dans l'univers, utilise le dernier (questionnaires[length-1])
   * Sinon, utilise INITIAL_BILAN_QUESTIONS
   */
  protected getCurrentQuestionnaire(context: HowanaContext): BilanQuestionnaireWithChunks {
    const bilanUniverContext = context.metadata?.['globalIntentInfos']?.bilanUniverContext as BilanUniverContext | undefined;
    const questionnaires = bilanUniverContext?.questionnaires?.value;
    
    if (questionnaires && questionnaires.length > 0) {
      // Utiliser le dernier questionnaire de la liste
      const lastQuestionnaire = questionnaires[questionnaires.length - 1];
      if (lastQuestionnaire) {
        return lastQuestionnaire;
      }
    }
    
    // Par défaut, utiliser INITIAL_BILAN_QUESTIONS
    return INITIAL_BILAN_QUESTIONS;
  }
    
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

  public override async computeIntent(context: HowanaContext, userMessage: string): Promise<{ intent: BilanQuestionIntent|null; intentCost: number | null; globalIntentInfos: any }> {
    
    // Récupérer le globalIntentInfos existant pour le conserver
    const existingGlobalIntentInfos = context.metadata?.['globalIntentInfos'] as any;
    
    // Vérifier si le message contient toutes les réponses en une fois (format JSON stringifié)
    let parsedMessage: BilanQuestionnaireUserMessage | null = null;
    try {
      parsedMessage = JSON.parse(userMessage) as BilanQuestionnaireUserMessage;
      if (parsedMessage && parsedMessage.type === 'bilan_answers' && Array.isArray(parsedMessage.answers)) {
        const mode = parsedMessage.mode || 'init';
        console.log(`📋 [BILAN] Détection du format bilan_answers avec ${parsedMessage.answers.length} réponses (mode: ${mode})`);
        
        // Stocker l'ensemble des données parsées dans le contexte
        const questionnaireUserAnswers: BilanQuestionnaireUserAnswers = {
          mode: mode as 'init' | 'specific',
          answers: parsedMessage.answers as BilanQuestionnaireAnswers
        };
        
        context.metadata = {
          ...context.metadata,
          ['questionnaireUserAnswers']: questionnaireUserAnswers
        };
        
        // Traiter toutes les réponses en une fois
        const allAnswers = parsedMessage.answers as BilanQuestionnaireAnswers;
        
        // Récupérer le questionnaire courant
        const currentQuestionnaire = this.getCurrentQuestionnaire(context);
        
        // Utiliser directement les réponses qui sont déjà au format BilanQuestionAnswer
        const questionResponses: BilanQuestionnaireAnswers = allAnswers;
        
        // Séparer les réponses standard (answerIndex !== null) de celles qui sont custom (answerIndex === null)
        // ET extraire les réponses aux askPrecision (moreResponse de type "text")
        const standardResponses: BilanQuestionnaireAnswers = [];
        const customResponses: Array<{ question: string; response: string }> = [];
        
        for (let i = 0; i < questionResponses.length; i++) {
          const qr = questionResponses[i];
          if (!qr || !qr.answerText) continue;
          
          // Récupérer la question correspondante depuis le questionnaire courant
          const questionData = qr.questionIndex >= 0 && qr.questionIndex < currentQuestionnaire.length
            ? currentQuestionnaire[qr.questionIndex]
            : null;
          
          const question = questionData?.question || `Question ${qr.questionIndex + 1}`;
          
          // Vérifier si la question a un answerType de type "address", "takeGeoloc" ou "homeAddress"
          let isAddressType = false;
          if (questionData && qr.answerIndex !== null && qr.answerIndex >= 0 && qr.answerIndex < questionData.quickReplies.length) {
            const quickReply = questionData.quickReplies[qr.answerIndex];
            if (quickReply && (quickReply.answerType === 'address' || quickReply.answerType === 'takeGeoloc' || quickReply.answerType === 'homeAddress')) {
              isAddressType = true;
            }
          }
          
          if (qr.answerIndex === null && !isAddressType) {
            // Réponse custom : pas d'index valide et ce n'est pas un type address
            customResponses.push({
              question,
              response: qr.answerText
            });
          } else {
            // Réponse standard : index valide
            standardResponses.push(qr);
          }
          
          // Si la réponse a un moreResponse de type "text", c'est une réponse à un askPrecision
          // L'ajouter aux custom réponses avec la question correspondante depuis askPrecision
          if (qr.moreResponse && qr.moreResponseType === 'text') {
            const questionDataForMore = qr.questionIndex >= 0 && qr.questionIndex < currentQuestionnaire.length
              ? currentQuestionnaire[qr.questionIndex]
              : null;
            
            // Récupérer la question askPrecision correspondante
            let precisionQuestion = "Peux-tu me donner plus de précisions ?";
            if (questionDataForMore && qr.answerIndex !== null && qr.answerIndex >= 0 && qr.answerIndex < questionDataForMore.quickReplies.length) {
              const quickReply = questionDataForMore.quickReplies[qr.answerIndex];
              if (quickReply && quickReply.askPrecision && quickReply.askPrecision.length > 0 && quickReply.askPrecision[0]) {
                // Utiliser la première question askPrecision (ou toutes si nécessaire)
                // Pour l'instant, on utilise la première question
                precisionQuestion = quickReply.askPrecision[0].question;
              }
            }
            
            // Ajouter la réponse aux askPrecision dans les custom réponses
            customResponses.push({
              question: precisionQuestion,
              response: qr.moreResponse
            });
          }
        }
        
        // Cumuler tous les chunks des quickReplies correspondant aux réponses standard
        const quickReplyChunks: BilanChunk[] = [];
        
        for (const qr of standardResponses) {
          if (!qr || qr.answerIndex === null || qr.answerIndex < 0) continue;
          
          const questionData = qr.questionIndex >= 0 && qr.questionIndex < currentQuestionnaire.length
            ? currentQuestionnaire[qr.questionIndex]
            : null;
          
          if (!questionData) continue;
          
          const quickReply = questionData.quickReplies[qr.answerIndex];
          if (quickReply && quickReply.chunks) {
            quickReplyChunks.push(...quickReply.chunks);
          }
        }
        
        console.log(`✅ [BILAN] ${quickReplyChunks.length} chunks cumulés depuis les quickReplies`);
        console.log(`📝 [BILAN] ${customResponses.length} réponse(s) custom détectée(s)`);
        
        // Vérifier la réponse à la question sur les animaux (index 6)
        const animalResponseStatus = this.checkAnimalResponse(questionResponses, currentQuestionnaire);
        
        // Stocker dans le contexte pour utilisation ultérieure (dans computeUniverse)
        if (animalResponseStatus !== AnimalResponseStatus.NotAnswered) {
          context.metadata = {
            ...context.metadata,
            ['animalUniverseStatus']: animalResponseStatus
          };
          console.log(`🐾 [BILAN] Statut des animaux déterminé: ${animalResponseStatus}`);
        }
        
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
            type: "bilan_question",
            universContext: {
              chunks: allChunks
            }
          },
          intentCost: intentCost,
          globalIntentInfos: existingGlobalIntentInfos // Conserver l'existant, sera mis à jour dans computeGlobalIntentInfos
        };
      }
    } catch (parseError) {
      // Ce n'est pas un JSON, ce n'est pas le format attendu
      console.error(`❌ [BILAN] Message non-JSON et non-format bilan_answers:`, parseError);
      // Retourner un intent vide
      return {
        intent: { 
          type: "bilan_question",
          universContext: {
            chunks: []
          }
        },
        intentCost: null,
        globalIntentInfos: existingGlobalIntentInfos
      };
    }
    
    // Si on arrive ici, le format n'est pas celui attendu
    console.error(`❌ [BILAN] Format de message non reconnu`);
    return {
      intent: { 
        type: "bilan_question",
        universContext: {
          chunks: []
        }
      },
      intentCost: null,
      globalIntentInfos: existingGlobalIntentInfos
    };
  }

  /**
   * Redéfinit handleIntent pour gérer les réponses en batch (toutes en une fois)
   * Toutes les réponses sont reçues en une fois (format bilan_answers), on force directement le résumé
   */
  protected override async handleIntent(
    context: HowanaContext,
    userMessage: string,
    onIaResponse: (response: any) => Promise<void>,
    _forceSummary: boolean = false,
    _autoResponse?: string, // Paramètre optionnel pour compatibilité avec la signature parente
    _isFirstCall: boolean = false
  ): Promise<HowanaContext> {

    // Vérifier si le message contient toutes les réponses en une fois (format JSON stringifié)
    let parsedMessage: BilanQuestionnaireUserMessage | null = null;
    try {
      parsedMessage = JSON.parse(userMessage) as BilanQuestionnaireUserMessage;
      if (parsedMessage && parsedMessage.type === 'bilan_answers' && Array.isArray(parsedMessage.answers)) {
        const mode = parsedMessage.mode || 'init';
        console.log(`✅ [BILAN] Toutes les réponses reçues en une fois (mode: ${mode})`);
        
        // Stocker l'ensemble des données parsées dans le contexte
        const questionnaireUserAnswers: BilanQuestionnaireUserAnswers = {
          mode: mode as 'init' | 'specific',
          answers: parsedMessage.answers as BilanQuestionnaireAnswers
        };
        
        context.metadata = {
          ...context.metadata,
          ['questionnaireUserAnswers']: questionnaireUserAnswers
        };
        
        // Récupérer intent depuis le contexte
        const currentIntentInfos = context.metadata?.['currentIntentInfos'] as any;
        const intent = currentIntentInfos?.intent as RecommendationIntent | undefined;
        
        // Calculer globalIntentInfos avec toutes les réponses
        // computeGlobalIntentInfos calcule l'univers pour chaque questionnaire
        let globalIntentInfos = await this.computeGlobalIntentInfos(intent, context, userMessage);
        
        context.metadata = {
          ...context.metadata,
          ['globalIntentInfos']: globalIntentInfos
        };
        
        return super.handleIntent(context, userMessage, onIaResponse, true, undefined, true);

      }
    } catch (parseError) {
      // Ce n'est pas un JSON, ce n'est pas le format attendu
      console.error(`❌ [BILAN] Message non-JSON et non-format bilan_answers:`, parseError);
      // Retourner le contexte tel quel
      return context;
    }

    // Si on arrive ici, le format n'est pas celui attendu
    console.error(`❌ [BILAN] Format de message non reconnu`);
    return context;
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
    
    // Récupérer globalIntentInfos pour filtrer les IDs à moins de 60 km
    const globalIntentInfos = context.metadata?.['globalIntentInfos'] as GlobalRecommendationIntentInfos | undefined;
    
    // Filtrer les activités à moins de 60 km
    const aroundYouActivityIds = (globalIntentInfos?.activities || [])
      .filter((activity: ActivityItem & { distanceFromOrigin?: DistanceResult }) => {
        if (!activity.distanceFromOrigin) return false;
        return activity.distanceFromOrigin.distance < 60;
      })
      .map((activity: ActivityItem) => activity.id);
    
    // Filtrer les pratiques à moins de 60 km
    const aroundYouPracticeIds = (globalIntentInfos?.practices || [])
      .filter((practice: PracticeItem & { distanceFromOrigin?: DistanceResult }) => {
        if (!practice.distanceFromOrigin) return false;
        return practice.distanceFromOrigin.distance < 60;
      })
      .map((practice: PracticeItem) => practice.id);
    
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
    
    console.log(`📍 [BILANS] AroundYou: ${aroundYouActivityIds.length} activités et ${aroundYouPracticeIds.length} pratiques à moins de 60 km`);

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
              families,
              aroundYouActivityIds,
              aroundYouPracticeIds
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
    families: BilanFamily[] = [],
    aroundYouActivityIds: string[] = [],
    aroundYouPracticeIds: string[] = []
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
    
    // byFamilyRecommendedPanel : objet avec une propriété par famille (pourcentage > 0)
    // Filtrer les familles avec pourcentage > 0 (pet-care sera exclu si l'utilisateur a répondu négativement aux animaux)
    const familiesWithPercentage = families.filter((f: BilanFamily) => f.dominancePercentage > 0);
    
    if (familiesWithPercentage.length > 0) {
      // Construire l'objet avec une propriété par famille (clé = familyId)
      // Chaque famille a son propre schéma avec uniquement les IDs de ses pratiques/activités
      const byFamilyPanelProperties: any = {};
      const byFamilyPanelRequired: string[] = [];
      
      familiesWithPercentage.forEach((family: BilanFamily) => {
        // Extraire les IDs des pratiques de cette famille (topPractices uniquement)
        const familyPracticeIds: string[] = [];
        if (family.topPractices && Array.isArray(family.topPractices)) {
          family.topPractices.forEach((practice: any) => {
            if (practice.id) {
              familyPracticeIds.push(practice.id);
            }
          });
        }
        
        // Extraire les IDs des activités de cette famille (topActivities uniquement)
        const familyActivityIds: string[] = [];
        if (family.topActivities && Array.isArray(family.topActivities)) {
          family.topActivities.forEach((activity: any) => {
            if (activity.id) {
              familyActivityIds.push(activity.id);
            }
          });
        }
        
        // Filtrer les IDs aroundYou pour cette famille uniquement
        const familyAroundYouPracticeIds = aroundYouPracticeIds.filter(id => familyPracticeIds.includes(id));
        const familyAroundYouActivityIds = aroundYouActivityIds.filter(id => familyActivityIds.includes(id));
        
        // Construire le schéma spécifique pour cette famille
        const familyPanelItemProperties: any = {
          familyName: {
            type: "string",
            description: "Nom de la famille de bien-être"
          }
        };
        const familyPanelItemRequired: string[] = ["familyName"];
        
        // Ajouter orderedRecommendedPractices seulement si cette famille a des pratiques
        if (familyPracticeIds.length > 0) {
          familyPanelItemProperties.orderedRecommendedPractices = {
            type: "array",
            items: recommendationItemSchema(
              familyPracticeIds,
              "Identifiant unique de la pratique recommandée pour cette famille"
            ),
            description: "Pratiques recommandées pour cette famille, ordonnées par pertinence décroissante (idéalement représentatives du pourcentage de dominance de la famille)"
          };
          familyPanelItemRequired.push("orderedRecommendedPractices");
        }
        
        // Ajouter orderedRecommendedActivities seulement si cette famille a des activités
        if (familyActivityIds.length > 0) {
          familyPanelItemProperties.orderedRecommendedActivities = {
            type: "array",
            items: recommendationItemSchema(
              familyActivityIds,
              "Identifiant unique de l'activité recommandée pour cette famille"
            ),
            description: "Activités recommandées pour cette famille, ordonnées par pertinence décroissante (idéalement représentatives du pourcentage de dominance de la famille)"
          };
          familyPanelItemRequired.push("orderedRecommendedActivities");
        }
        
        familyPanelItemProperties.reason = {
          type: "string",
          description: "Message destiné à l'utilisateur expliquant pourquoi ces choix spécifiques ont été faits pour cette famille et pourquoi cet ordre de recommandation (du plus pertinent au moins pertinent), formulé en vous parlant directement"
        };
        familyPanelItemRequired.push("reason");
        
        // Ajouter aroundYouRecommended si on a des IDs disponibles à moins de 60 km pour cette famille
        const hasFamilyAroundYouActivities = familyAroundYouActivityIds.length > 0;
        const hasFamilyAroundYouPractices = familyAroundYouPracticeIds.length > 0;
        
        if (hasFamilyAroundYouActivities || hasFamilyAroundYouPractices) {
          const aroundYouProperties: any = {};
          const aroundYouRequired: string[] = [];
          
          if (hasFamilyAroundYouPractices) {
            aroundYouProperties.orderedRecommendedPractices = {
              type: "array",
              items: recommendationItemSchema(
                familyAroundYouPracticeIds,
                "Identifiant unique de la pratique recommandée pour cette famille, située à moins de 60 km"
              ),
              description: "Pratiques recommandées pour cette famille situées à moins de 60 km, ordonnées par pertinence décroissante"
            };
            aroundYouRequired.push("orderedRecommendedPractices");
          }
          
          if (hasFamilyAroundYouActivities) {
            aroundYouProperties.orderedRecommendedActivities = {
              type: "array",
              items: recommendationItemSchema(
                familyAroundYouActivityIds,
                "Identifiant unique de l'activité recommandée pour cette famille, située à moins de 60 km"
              ),
              description: "Activités recommandées pour cette famille situées à moins de 60 km, ordonnées par pertinence décroissante"
            };
            aroundYouRequired.push("orderedRecommendedActivities");
          }
          
          aroundYouProperties.reason = {
            type: "string",
            description: "Message destiné à l'utilisateur expliquant pourquoi ces recommandations à proximité (moins de 60 km) ont été choisies pour cette famille, formulé en vous parlant directement"
          };
          aroundYouRequired.push("reason");
          
          familyPanelItemProperties.aroundYouRecommended = {
            type: "object",
            properties: aroundYouProperties,
            required: aroundYouRequired,
            additionalProperties: false,
            description: "Recommandations à proximité (moins de 60 km) pour cette famille"
          };
          // Ajouter aroundYouRecommended dans le tableau required si présent
          familyPanelItemRequired.push("aroundYouRecommended");
        }
        
        byFamilyPanelProperties[family.id] = {
          type: "object",
          properties: familyPanelItemProperties,
          required: familyPanelItemRequired,
          additionalProperties: false,
          description: `Recommandations pour la famille ${family.name} (${family.dominancePercentage.toFixed(1)}% de dominance). Les pratiques et activités proposées sont limitées à celles appartenant à cette famille.`
        };
        byFamilyPanelRequired.push(family.id);
      });
      
      properties.byFamilyRecommendedPanel = {
        type: "object",
        properties: byFamilyPanelProperties,
        required: byFamilyPanelRequired,
        additionalProperties: false,
        description: "Recommandations organisées par famille de bien-être. Chaque propriété correspond à une famille identifiée dans le contexte (avec pourcentage > 0). L'identifiant de la famille sert de clé."
      };
    }
    
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
  public override async generateConversationSummary(context: HowanaContext, firstCall: boolean = false): Promise<{
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
    const result = await super.generateConversationSummary(context, firstCall);

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
   * Construit la réponse finale en combinant le texte IA, la question et les quick replies
   * Dans le cas des questions de bilan, aiResponse.response est toujours du texte (string)
   */
  private buildFinalResponse(
    aiResponse: RecommendationMessageResponse,
    questionIndex: number,
    context: HowanaContext
  ): RecommendationMessageResponse {

    console.log('💬 [BILAN] buildFinalResponse - questionIndex:', questionIndex);

    // Récupérer le questionnaire courant
    const currentQuestionnaire = this.getCurrentQuestionnaire(context);
    
    const currentQuestion = questionIndex >= 0 && questionIndex < currentQuestionnaire.length 
      ? currentQuestionnaire[questionIndex] 
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
   * Schéma de sortie pour les messages
   * Permet à l'IA de retourner un questionnaire optionnel après avoir reçu des réponses
   * L'univers est calculé pour chaque questionnaire, donc on peut toujours générer un questionnaire si nécessaire
   */
  protected override getAddMessageOutputSchema(_context: HowanaContext, _forceSummaryToolCall: boolean = false): ChatBotOutputSchema {
    // On peut toujours générer un nouveau questionnaire si nécessaire
    return {
      format: { 
        type: "json_schema",
        name: "BilanChatBotResponse",
        schema: {
          type: "object",
          properties: {
            response: {
              type: "string",
              description: "Réponse principale de l'assistant. Analyse les réponses reçues et génère un nouveau questionnaire personnalisé pour approfondir la compréhension du profil de l'utilisateur."
            },
            questionnaire: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: {
                    type: "string",
                    description: "Question à poser à l'utilisateur pour approfondir la compréhension de son profil"
                  },
                  quickReplies: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: {
                          type: "string",
                          description: "Texte de la réponse rapide"
                        },
                        icon: {
                          type: "string",
                          description: "Icône optionnelle pour la réponse rapide (ex: 'heart', 'zap', 'sleep', 'alert-triangle', 'smile', 'explore')",
                          enum: ["heart", "zap", "sleep", "alert-triangle", "smile", "explore"]
                        }
                      },
                      required: ["text", "icon"],
                      additionalProperties: false
                    },
                    description: "Réponses rapides suggérées pour cette question"
                  }
                },
                required: ["question", "quickReplies"],
                additionalProperties: false
              },
              description: "Nouveau questionnaire personnalisé basé sur les réponses précédentes. Génère des questions pertinentes pour approfondir la compréhension du profil et des particularités de l'utilisateur."
            }
          },
          required: ["response", "questionnaire"],
          additionalProperties: false
        },
        strict: true
      }
    };
  }

  /**
   * Redéfinit beforeAiResponseSend pour construire la réponse finale avec question et quick replies
   * Détecte également les questionnaires reçus depuis l'IA et les stocke dans l'univers
   */
  protected override async beforeAiResponseSend(
    aiResponse: RecommendationMessageResponse, 
    context: HowanaContext
  ): Promise<RecommendationMessageResponse> {
    // Si la réponse est de type summary, ne rien faire
    if ((aiResponse as any).type === 'summary' || (aiResponse as any).message_type === 'summary') {
      return aiResponse;
    }
    
    // Vérifier si la réponse contient un nouveau questionnaire

    if (aiResponse && aiResponse.questionnaire) {
      console.log(`📋 [BILAN] Nouveau questionnaire reçu depuis l'IA: ${aiResponse.questionnaire.length} questions`);
      
      // Convertir le questionnaire en format avec chunks
      const newQuestionnaire = this.convertQuestionnaireToWithChunks(aiResponse.questionnaire);
      
      // Récupérer les questionnaires existants depuis l'univers
      const bilanUniverContext = context.metadata?.['globalIntentInfos']?.bilanUniverContext as BilanUniverContext | undefined;
      const existingQuestionnaires = bilanUniverContext?.questionnaires?.value || [];
      
      // Calculer le hash du nouveau questionnaire
      const newQuestionnaireHash = this.calculateQuestionnaireHash(newQuestionnaire);
      
      // Vérifier si un questionnaire avec le même hash existe déjà
      const isQuestionnaireAlreadyStored = existingQuestionnaires.some((q: BilanQuestionnaireWithChunks) => {
        const existingHash = this.calculateQuestionnaireHash(q);
        return existingHash === newQuestionnaireHash;
      });
      
      // Ajouter le nouveau questionnaire à la liste seulement s'il n'existe pas déjà
      const updatedQuestionnaires = isQuestionnaireAlreadyStored
        ? existingQuestionnaires
        : [...existingQuestionnaires, newQuestionnaire];
      
      if (isQuestionnaireAlreadyStored) {
        console.log(`📋 [BILAN] Questionnaire déjà présent (hash: ${newQuestionnaireHash}), non ajouté`);
      } else {
        console.log(`📋 [BILAN] Nouveau questionnaire ajouté (hash: ${newQuestionnaireHash})`);
      }
      
      // Mettre à jour le contexte avec le nouveau questionnaire
      context.metadata = {
        ...context.metadata,
        ['globalIntentInfos']: {
          ...context.metadata?.['globalIntentInfos'],
          bilanUniverContext: {
            ...bilanUniverContext,
            questionnaires: {
              info: 'Liste des questionnaires utilisés pour ce bilan, dans l\'ordre chronologique. Le dernier questionnaire de la liste est le questionnaire courant.',
              value: updatedQuestionnaires
            }
          }
        }
      };
      
      // Mettre à jour le contexte dans la réponse
      aiResponse.updatedContext = context;
      
      console.log(`✅ [BILAN] Questionnaire ajouté à l'univers (${updatedQuestionnaires.length} questionnaire(s) au total)`);
    }
    
    // Pour la première réponse uniquement, construire la réponse avec la première question
    // (index 0) et les quick replies
    console.log('💬 [BILAN] beforeAiResponseSend - Première réponse, ajout de la première question');
    return this.buildFinalResponse(aiResponse, 0, context);
  }


  /**
   * Schéma de sortie pour le calcul d'intent spécifique aux bilans
   * Retourne un schéma de chunks typés pour extraire les informations des réponses
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
   * Gère à la fois le format batch (toutes les réponses en une fois) et le format individuel
   * @param intent L'intent calculé
   * @param context Le contexte de la conversation
   * @param userMessage Le message de l'utilisateur (réponse à la question précédente ou toutes les réponses)
   */
  protected override async computeGlobalIntentInfos(
    intent: any, 
    context: HowanaContext, 
    userMessage?: string
  ): Promise<any> {
  
    // Récupérer le questionnaire courant
    const currentQuestionnaire = this.getCurrentQuestionnaire(context);
    
    // Vérifier si le message contient toutes les réponses en une fois (format JSON stringifié)
    let parsedMessage: BilanQuestionnaireUserMessage | null = null;
    let questionResponses: BilanQuestionnaireAnswers = [];
    let totalQuestions = currentQuestionnaire.length;
    let answeredQuestions = totalQuestions;
    
    console.log("userMessage.length = ", userMessage?.length || 0);

    // Ne tenter le parsing que si userMessage existe et n'est pas vide
    if (userMessage && userMessage.trim().length > 0) {
      try {
        parsedMessage = JSON.parse(userMessage) as BilanQuestionnaireUserMessage;
        if (parsedMessage && parsedMessage.type === 'bilan_answers' && Array.isArray(parsedMessage.answers)) {
          const mode = parsedMessage.mode || 'init';
          console.log(`📋 [BILAN] computeGlobalIntentInfos - Traitement de ${parsedMessage.answers.length} réponses en batch (mode: ${mode})`);
          
          // Stocker l'ensemble des données parsées dans le contexte
          const questionnaireUserAnswers: BilanQuestionnaireUserAnswers = {
            mode: mode as 'init' | 'specific',
            answers: parsedMessage.answers as BilanQuestionnaireAnswers
          };
          
          if (context.metadata) {
            context.metadata['questionnaireUserAnswers'] = questionnaireUserAnswers;
          } else {
            context.metadata = { ['questionnaireUserAnswers']: questionnaireUserAnswers };
          }
          
          // Construire les questionResponses à partir de toutes les réponses
          // Les réponses sont déjà au format BilanQuestionAnswer, on les utilise directement
          for (const answer of parsedMessage.answers) {
            questionResponses.push(answer);
          }
          
          answeredQuestions = questionResponses.length;
          console.log(`✅ [BILAN] computeGlobalIntentInfos - ${answeredQuestions} réponses traitées en batch`);
        }
      } catch (parseError) {
        // Ce n'est pas un JSON, ce n'est pas le format attendu
        console.error(`❌ [BILAN] computeGlobalIntentInfos - Message non-JSON et non-format bilan_answers:`, parseError);
          // Récupérer les questionnaires existants pour les conserver
        const previousBilanUniverContext = (context.metadata?.['globalIntentInfos'] as any)?.bilanUniverContext;
        const existingQuestionnaires = previousBilanUniverContext?.questionnaires?.value || [];
        
        // Retourner un globalIntentInfos vide mais en conservant les questionnaires existants
        return {
          bilanUniverContext: {
            families: { info: '', value: [] },
            practices: { info: '', value: [] },
            activities: { info: '', value: [] },
            howerAngels: { info: '', value: [] },
            questionResponses: { info: '', value: [] },
            chunks: { info: '', value: [] },
            questionnaires: {
              info: 'Liste des questionnaires utilisés pour ce bilan, dans l\'ordre chronologique. Le dernier questionnaire de la liste est le questionnaire courant.',
              value: existingQuestionnaires
            },
            computedAt: new Date().toISOString()
          }
        };
      }
    }
    
    // Si on n'a pas traité en batch, retourner un globalIntentInfos vide
    if (questionResponses.length === 0) {
      console.error(`❌ [BILAN] computeGlobalIntentInfos - Aucune réponse traitée`);
      
      // Récupérer les questionnaires existants pour les conserver
      const previousBilanUniverContext = (context.metadata?.['globalIntentInfos'] as any)?.bilanUniverContext;
      const existingQuestionnaires = previousBilanUniverContext?.questionnaires?.value || [];
      
      return {
        bilanUniverContext: {
          families: { info: '', value: [] },
          practices: { info: '', value: [] },
          activities: { info: '', value: [] },
          howerAngels: { info: '', value: [] },
          questionResponses: { info: '', value: [] },
          chunks: { info: '', value: [] },
          questionnaires: {
            info: 'Liste des questionnaires utilisés pour ce bilan, dans l\'ordre chronologique. Le dernier questionnaire de la liste est le questionnaire courant.',
            value: existingQuestionnaires
          },
          computedAt: new Date().toISOString()
        }
      };
    }
    
    // Récupérer les questionnaires existants depuis l'univers précédent
    const previousBilanUniverContext = (context.metadata?.['globalIntentInfos'] as any)?.bilanUniverContext;
    let existingQuestionnaires = previousBilanUniverContext?.questionnaires?.value || [];
    
    // Si aucun questionnaire n'existe, initialiser avec INITIAL_BILAN_QUESTIONS
    if (existingQuestionnaires.length === 0) {
      existingQuestionnaires = [INITIAL_BILAN_QUESTIONS];
      console.log(`📋 [BILAN] Initialisation avec INITIAL_BILAN_QUESTIONS`);
    }
    
    // Calculer le hash du questionnaire courant
    const currentQuestionnaireHash = this.calculateQuestionnaireHash(currentQuestionnaire);
    
    // Vérifier si un questionnaire avec le même hash existe déjà
    const isQuestionnaireAlreadyStored = existingQuestionnaires.some((q: BilanQuestionnaireWithChunks) => {
      const existingHash = this.calculateQuestionnaireHash(q);
      return existingHash === currentQuestionnaireHash;
    });
    
    // Ajouter le questionnaire courant seulement s'il n'existe pas déjà
    const questionnaires: BilanQuestionnaireWithChunks[] = [...existingQuestionnaires];
    
    if (!isQuestionnaireAlreadyStored) {
      questionnaires.push(currentQuestionnaire);
      console.log(`📋 [BILAN] Questionnaire courant ajouté à la liste (hash: ${currentQuestionnaireHash}, ${questionnaires.length} questionnaire(s) au total)`);
    } else {
      console.log(`📋 [BILAN] Questionnaire courant déjà présent (hash: ${currentQuestionnaireHash}), non ajouté (${questionnaires.length} questionnaire(s) au total)`);
    }
    
    // Récupérer toutes les réponses de tous les questionnaires depuis le contexte
    // Les réponses précédentes sont stockées dans questionResponses de l'univers précédent
    const previousQuestionResponses = previousBilanUniverContext?.questionResponses?.value || [];
    
    // Combiner toutes les réponses : réponses précédentes + réponses du questionnaire courant
    const allQuestionResponses = [...previousQuestionResponses, ...questionResponses];
    
    console.log(`📋 [BILAN] Total: ${allQuestionResponses.length} réponses (${previousQuestionResponses.length} précédentes + ${questionResponses.length} courantes)`);
    
    // Calculer l'univers pour chaque questionnaire (plus besoin d'attendre 2 questionnaires)
    console.log(`✅ [BILAN] ${questionnaires.length} questionnaire(s) détecté(s), calcul de l'univers avec toutes les réponses`);
    
    // Récupérer les chunks précédents depuis l'univers précédent
    const previousChunks = previousBilanUniverContext?.chunks?.value || [];
    
    // Combiner les chunks précédents avec les chunks de l'intent actuel
    const currentChunks = (intent as BilanQuestionIntent)?.universContext?.chunks || [];
    const allChunks = [...previousChunks, ...currentChunks];
    
    // Créer un intent combiné avec tous les chunks
    const combinedIntent: BilanQuestionIntent = {
      type: "bilan_question",
      universContext: {
        chunks: allChunks
      }
    };
    
    console.log(`✅ [BILAN] ${allChunks.length} chunks combinés (${previousChunks.length} précédents + ${currentChunks.length} courants)`);
    
    // Calculer l'univers avec toutes les réponses de tous les questionnaires
    const universe = await this.computeUniverse(
      combinedIntent, 
      allQuestionResponses, 
      questionnaires, // Passer tous les questionnaires
      totalQuestions, 
      answeredQuestions,
      context // Passer le contexte pour accéder aux questionnaireAnswers
    );
    
    // Convertir les résultats de l'univers en format GlobalRecommendationIntentInfos
    // pour que validateSummaryResponse puisse les récupérer
    // Les données incluent déjà distanceFromOrigin si les distances ont été calculées
    type PracticeWithDistance = PracticeSearchResult & { source?: 'semantic' | 'worker'; workerReasons?: string[]; distanceFromOrigin?: DistanceResult };
    type ActivityWithDistance = ActivitySearchResult & { distanceFromOrigin?: DistanceResult };
    type HowerAngelWithDistance = HowerAngelSearchResult & { distanceFromOrigin?: DistanceResult };
    
    const practicesFromUniverse = (universe.practices?.value || []) as PracticeWithDistance[];
    const activitiesFromUniverse = (universe.activities?.value || []) as ActivityWithDistance[];
    const howerAngelsFromUniverse = (universe.howerAngels?.value || []) as HowerAngelWithDistance[];
    
    // Convertir PracticeSearchResult[] en PracticeItem[] avec distance
    const practiceItems = practicesFromUniverse.map((practice: PracticeWithDistance) => ({
      type: 'practice' as const,
      id: practice.id,
      title: practice.title,
      shortDescription: practice.shortDescription,
      longDescription: practice.longDescription,
      benefits: practice.benefits,
      typicalSituations: practice.typicalSituations,
      relevanceScore: practice.relevanceScore || 0,
      distanceFromOrigin: practice.distanceFromOrigin // Inclure la distance
    }));
    
    // Convertir ActivitySearchResult[] en ActivityItem[] avec distance
    const activityItems = activitiesFromUniverse.map((activity: ActivityWithDistance) => ({
      type: 'activity' as const,
      id: activity.id,
      title: activity.title,
      shortDescription: activity.shortDescription,
      longDescription: activity.longDescription,
      durationMinutes: activity.durationMinutes,
      participants: activity.participants,
      rating: activity.rating,
      price: activity.price,
      benefits: activity.benefits,
      locationType: activity.locationType,
      address: activity.address,
      selectedKeywords: activity.selectedKeywords,
      typicalSituations: activity.typicalSituations,
      relevanceScore: activity.relevanceScore || 0,
      distanceFromOrigin: activity.distanceFromOrigin // Inclure la distance
    }));
    
    // Convertir HowerAngelSearchResult[] en HowerAngelItem[] avec distance
    const howerAngelItems = howerAngelsFromUniverse.map((howerAngel: HowerAngelWithDistance) => ({
      id: howerAngel.id,
      userId: howerAngel.userId,
      firstName: howerAngel.firstName,
      lastName: howerAngel.lastName,
      email: howerAngel.email,
      specialties: howerAngel.specialties,
      experience: howerAngel.experience,
      profile: howerAngel.profile || '',
      activities: howerAngel.activities,
      relevanceScore: howerAngel.relevanceScore || 0,
      distanceFromOrigin: howerAngel.distanceFromOrigin // Inclure la distance
    }));
    
    // Créer globalIntentInfos avec les résultats de l'univers
    // Inclure à la fois bilanUniverContext ET les champs activities, practices, howerAngels
    // pour que validateSummaryResponse puisse les récupérer
    return {
      bilanUniverContext: {
        families: universe.families,
        practices: universe.practices,
        activities: universe.activities,
        howerAngels: universe.howerAngels,
        questionResponses: universe.questionResponses,
        chunks: universe.chunks,
        questionnaires: {
          info: 'Liste des questionnaires utilisés pour ce bilan, dans l\'ordre chronologique. Le dernier questionnaire de la liste est le questionnaire courant.',
          value: questionnaires
        },
        computedAt: new Date().toISOString()
      },
      // Ajouter les données converties pour que validateSummaryResponse puisse les utiliser
      activities: activityItems,
      practices: practiceItems,
      howerAngels: howerAngelItems,
      faqs: [], // Pas de FAQs pour les bilans
      focusedHowerAngel: null,
      focusedActivity: null,
      focusedPractice: null,
      focusedFaqs: [],
      pendingConfirmations: {
        focusedHowerAngel: null,
        focusedActivity: null,
        focusedPractice: null
      },
      unknownFocused: null
    };

  }

  /**
   * Récupère les données depuis la recherche sémantique (méthode actuelle)
   * @param allChunksTexts Les textes des chunks pour la recherche
   * @returns Les résultats de recherche sémantique
   */
  protected async retrieveDataFromSemanticSearch(
    allChunksTexts: string[]
  ): Promise<{
    practices: PracticeSearchResult[];
    activities: ActivitySearchResult[];
    howerAngels: HowerAngelSearchResult[];
  }> {
    console.log(`🔍 [SEMANTIC] Recherche sémantique avec ${allChunksTexts.length} chunks`);
    
    // Réaliser les recherches sémantiques en parallèle avec withMatchInfos
    const [practicesResults, activitiesResults, howerAngelsResult] = await Promise.all([
      this.supabaseService.searchPracticesBySituationChunks(allChunksTexts, true), // withMatchInfos = true
      this.supabaseService.searchActivitiesBySituationChunks(allChunksTexts, true), // withMatchInfos = true
      this.supabaseService.searchHowerAngelsByUserSituation(allChunksTexts, 10, true) // withMatchInfos = true
    ]);
    
    const practices: PracticeSearchResult[] = practicesResults.results || [];
    const activities: ActivitySearchResult[] = activitiesResults.results || [];
    const howerAngels: HowerAngelSearchResult[] = howerAngelsResult.success ? (howerAngelsResult.data || []) : [];
    
    console.log(`✅ [SEMANTIC] ${practices.length} pratiques, ${activities.length} activités et ${howerAngels.length} hower angels trouvés`);
    
    return {
      practices,
      activities,
      howerAngels
    };
  }

  /**
   * Récupère les données depuis la recherche agentique via workers IA pour les hower angels
   * @param allChunksTexts Les textes des chunks pour le contexte utilisateur
   * @param context Le contexte de la conversation
   * @returns Les 15 meilleurs hower angels trouvés par les workers IA
   */
  protected async retrieveDataFromAgentWorkerSearchForHowerAngels(
    allChunksTexts: string[],
    context: HowanaContext,
    allHowerAngels: HowerAngelSearchResult[]
  ): Promise<HowerAngelSearchResult[]> {
    console.log(`🔍 [WORKER] Démarrage de la recherche agentique pour les hower angels`);
    
    // Utiliser les hower angels passés en paramètre (déjà récupérés depuis la base de données)
    if (!allHowerAngels || allHowerAngels.length === 0) {
      console.warn('⚠️ [WORKER] Aucun hower angel fourni, retour d\'un tableau vide');
      return [];
    }
    
    console.log(`🔍 [WORKER] Analyse de ${allHowerAngels.length} hower angels via workers IA (full database search)`);
    
    // Fonction pour extraire le texte d'un hower angel
    const howerAngelToText = (howerAngel: HowerAngelSearchResult | HowerAngelWithDistance): string => {
      const parts: string[] = [];
      parts.push(`Nom: ${howerAngel.firstName || ''} ${howerAngel.lastName || ''}`);
      if (howerAngel.profile) {
        parts.push(`Profil: ${howerAngel.profile}`);
      }
      if (howerAngel.experience) {
        parts.push(`Expérience: ${howerAngel.experience}`);
      }
      if (howerAngel.specialties && howerAngel.specialties.length > 0) {
        const specialtiesText = howerAngel.specialties.map(s => s.title || '').join(', ');
        parts.push(`Spécialités: ${specialtiesText}`);
      }
      if (howerAngel.activities && howerAngel.activities.length > 0) {
        const activitiesText = howerAngel.activities
          .map(a => `${a.title}${a.shortDescription ? ` - ${a.shortDescription}` : ''}`)
          .join('; ');
        parts.push(`Activités: ${activitiesText}`);
      }
      // Ajouter la mention de distance si disponible
      if ('distanceFromOrigin' in howerAngel && howerAngel.distanceFromOrigin) {
        parts.push(`Distance: à ${howerAngel.distanceFromOrigin.formattedDistance} de distance`);
      }
      return parts.join('\n\n');
    };
    
    // Construire les instructions spécifiques pour les workers de hower angels
    const totalHowerAngels = allHowerAngels.length;
    const itemsPerWorker = 10;
    const workerInstruction = `Tu es un assistant spécialisé dans l'analyse de pertinence de praticiens de bien-être (hower angels).

OBJECTIF:
Tu dois identifier les praticiens les plus adaptés parmi un total de ${totalHowerAngels} praticiens disponibles sur la plateforme HOW PASS.

TA MISSION:
Tu es en charge d'analyser ${itemsPerWorker} praticiens parmi les ${totalHowerAngels} disponibles. Pour chaque praticien, tu dois évaluer sa pertinence globale en fonction du contexte utilisateur fourni.

CRITÈRES D'ÉVALUATION:
- Analyse la correspondance entre les besoins exprimés dans le contexte utilisateur et les spécialités du praticien
- Évalue la pertinence des activités proposées par le praticien par rapport au profil de l'utilisateur
- Considère l'expérience et le profil du praticien pour comprendre son champ d'expertise
- Évalue la pertinence globale, pas seulement une correspondance partielle
- IMPORTANT: Ne te base PAS QUE sur la notoriété ou la déclaration du praticien. La pertinence se juge principalement sur la correspondance des spécialités et activités avec les besoins exprimés par l'utilisateur.

Retourne uniquement les praticiens avec un score de pertinence >= 7/10.`;

    // Appeler la fonction générique de worker (héritée de BaseChatBotService)
    const workerResults = await this.retrieveDataFromAgentWorkerSearch(
      allHowerAngels,
      allChunksTexts, // Contexte utilisateur = chunks
      howerAngelToText,
      context,
      workerInstruction,
      itemsPerWorker, // 10 hower angels par worker
      0.7, // Score minimum 7/10
      15  // Top 15 résultats
    );
    
    // Convertir les résultats en HowerAngelSearchResult
    const workerHowerAngels = workerResults.results.map(result => {
      const howerAngel = result.item;
      
      return {
        ...howerAngel,
        relevanceScore: result.confidenceScore, // Score de confiance du worker (0-1)
        similarity: result.confidenceScore,
        workerReasons: result.reasons, // Raisons du worker
        source: 'worker' as const // Indiquer la provenance
      } as HowerAngelSearchResult & { workerReasons?: string[]; source?: 'semantic' | 'worker' };
    });
    
    console.log(`✅ [WORKER] ${workerHowerAngels.length} hower angels pertinents trouvés via workers IA`);
    
    return workerHowerAngels;
  }

  /**
   * Récupère les données depuis la recherche agentique via workers IA
   * @param allChunksTexts Les textes des chunks pour le contexte utilisateur
   * @param context Le contexte de la conversation
   * @param semanticPractices Les pratiques trouvées par la recherche sémantique (pour enrichir les résultats)
   * @returns Les pratiques pertinentes trouvées par les workers IA
   */
  protected async retrieveDataFromAgentWorkerSearchForPractices(
    allChunksTexts: string[],
    context: HowanaContext,
    semanticPractices: PracticeSearchResult[],
    allPractices: Array<{
      id: string;
      title: string;
      longDescription: string | null;
      benefits: string[] | undefined;
      typicalSituations: string[] | undefined;
    }>
  ): Promise<PracticeSearchResult[]> {
    console.log(`🔍 [WORKER] Démarrage de la recherche agentique pour les pratiques`);
    
    // Utiliser les pratiques passées en paramètre (déjà récupérées depuis la base de données)
    if (!allPractices || allPractices.length === 0) {
      console.warn('⚠️ [WORKER] Aucune pratique fournie, retour d\'un tableau vide');
      return [];
    }
    
    console.log(`🔍 [WORKER] Analyse de ${allPractices.length} pratiques via workers IA`);
    
    // Fonction pour extraire le texte d'une pratique
    const practiceToText = (practice: typeof allPractices[0]): string => {
      const parts: string[] = [];
      parts.push(`Titre: ${practice.title}`);
      if (practice.longDescription) {
        parts.push(`Description: ${practice.longDescription}`);
      }
      if (practice.benefits) {
        const benefitsText = Array.isArray(practice.benefits) 
          ? practice.benefits.join(', ')
          : JSON.stringify(practice.benefits);
        parts.push(`Bénéfices: ${benefitsText}`);
      }
      if (practice.typicalSituations) {
        const situationsText = Array.isArray(practice.typicalSituations)
          ? practice.typicalSituations.join(', ')
          : JSON.stringify(practice.typicalSituations);
        parts.push(`Situations typiques: ${situationsText}`);
      }
      return parts.join('\n\n');
    };
    
    // Construire les instructions spécifiques pour les workers de pratiques
    const totalPractices = allPractices.length;
    const itemsPerWorker = 10;
    const workerInstruction = `Tu es un assistant spécialisé dans l'analyse de pertinence de pratiques de bien-être.

OBJECTIF:
Tu dois identifier les pratiques les plus adaptées parmi un total de ${totalPractices} pratiques disponibles sur la plateforme HOW PASS.

TA MISSION:
Tu es en charge d'analyser ${itemsPerWorker} pratiques parmi les ${totalPractices} disponibles. Pour chaque pratique, tu dois évaluer sa pertinence globale en fonction du contexte utilisateur fourni.

CRITÈRES D'ÉVALUATION:
- Analyse la correspondance entre les besoins exprimés dans le contexte utilisateur et les bénéfices de la pratique
- Évalue la pertinence des situations typiques de la pratique par rapport au profil de l'utilisateur
- Considère la description longue de la pratique pour comprendre son champ d'application
- Évalue la pertinence globale, pas seulement une correspondance partielle
- IMPORTANT: Ne te base PAS QUE sur la notoriété ou la déclaration de la pratique. Certaines pratiques peuvent être créées et pas forcément connues du grand public, mais si les mots-clés et les bénéfices semblent pertinents par rapport au contexte utilisateur, tu dois les mettre en avant. La pertinence se juge principalement sur la correspondance des mots-clés et des bénéfices, pas uniquement sur la popularité.

Retourne uniquement les pratiques avec un score de pertinence >= 7/10.`;

    // Appeler la fonction générique de worker
    const workerResults = await this.retrieveDataFromAgentWorkerSearch(
      allPractices,
      allChunksTexts, // Contexte utilisateur = chunks
      practiceToText,
      context,
      workerInstruction,
      itemsPerWorker, // 10 pratiques par worker
      0.7, // Score minimum 7/10
      10  // Top 10 résultats
    );
    
    // Convertir les résultats en PracticeSearchResult
    const workerPractices = workerResults.results.map(result => {
      const practice = result.item;
      // Trouver la pratique correspondante dans les résultats sémantiques pour récupérer les infos complètes
      const semanticPractice = semanticPractices.find(p => p.id === practice.id);
      
      return {
        type: 'practice' as const,
        id: practice.id,
        title: practice.title,
        longDescription: practice.longDescription || undefined,
        benefits: practice.benefits,
        typicalSituations: practice.typicalSituations,
        relevanceScore: result.confidenceScore, // Score de confiance du worker (0-1)
        similarity: result.confidenceScore,
        vectorSimilarity: null,
        bm25Similarity: null,
        categoryId: semanticPractice?.categoryId || null,
        categoryName: semanticPractice?.categoryName || null,
        categoryDescription: semanticPractice?.categoryDescription || null,
        familyId: semanticPractice?.familyId || null,
        familyName: semanticPractice?.familyName || null,
        familyDescription: semanticPractice?.familyDescription || null,
        matchCount: 1,
        workerReasons: result.reasons, // Raisons du worker
        source: 'worker' as const // Indiquer la provenance
      } as PracticeSearchResult & { workerReasons?: string[]; source?: 'semantic' | 'worker' };
    });
    
    console.log(`✅ [WORKER] ${workerPractices.length} pratiques pertinentes trouvées via workers IA`);
    
    return workerPractices;
  }

  /**
   * Récupère les activités depuis la recherche agentique via workers IA
   * @param allChunksTexts Les textes des chunks pour le contexte utilisateur
   * @param context Le contexte de la conversation
   * @param allActivities Les activités récupérées depuis la base de données (full database search)
   * @returns Les activités pertinentes trouvées par les workers IA
   */
  protected async retrieveDataFromAgentWorkerSearchForActivities(
    allChunksTexts: string[],
    context: HowanaContext,
    allActivities: Array<{
      id: string;
      title: string;
      shortDescription: string | null;
      longDescription: string | null;
      benefits: any;
      typicalSituations: string | null;
      locationType: string | null;
      address: any;
      practiceId: string | null;
      creatorId: string | null;
    }>
  ): Promise<ActivitySearchResult[]> {
    console.log(`🔍 [WORKER] Démarrage de la recherche agentique pour les activités`);
    
    // Utiliser les activités passées en paramètre (déjà récupérées depuis la base de données)
    if (!allActivities || allActivities.length === 0) {
      console.warn('⚠️ [WORKER] Aucune activité fournie, retour d\'un tableau vide');
      return [];
    }
    
    console.log(`🔍 [WORKER] Analyse de ${allActivities.length} activités via workers IA`);
    
    // Fonction pour extraire le texte d'une activité
    const activityToText = (activity: typeof allActivities[0]): string => {
      const parts: string[] = [];
      parts.push(`Titre: ${activity.title}`);
      if (activity.shortDescription) {
        parts.push(`Description courte: ${activity.shortDescription}`);
      }
      if (activity.longDescription) {
        parts.push(`Description longue: ${activity.longDescription}`);
      }
      if (activity.benefits) {
        const benefitsText = Array.isArray(activity.benefits) 
          ? activity.benefits.join(', ')
          : JSON.stringify(activity.benefits);
        parts.push(`Bénéfices: ${benefitsText}`);
      }
      if (activity.typicalSituations) {
        parts.push(`Situations typiques: ${activity.typicalSituations}`);
      }
      if (activity.locationType) {
        parts.push(`Type de localisation: ${activity.locationType}`);
      }
      return parts.join('\n\n');
    };
    
    // Construire les instructions spécifiques pour les workers d'activités
    const totalActivities = allActivities.length;
    const itemsPerWorker = 10;
    const workerInstruction = `Tu es un assistant spécialisé dans l'analyse de pertinence d'activités de bien-être.

OBJECTIF:
Tu dois identifier les activités les plus adaptées parmi un total de ${totalActivities} activités disponibles sur la plateforme HOW PASS.

TA MISSION:
Tu es en charge d'analyser ${itemsPerWorker} activités parmi les ${totalActivities} disponibles. Pour chaque activité, tu dois évaluer sa pertinence globale en fonction du contexte utilisateur fourni.

CRITÈRES D'ÉVALUATION:
- Analyse la correspondance entre les besoins exprimés dans le contexte utilisateur et les bénéfices de l'activité
- Évalue la pertinence des situations typiques de l'activité par rapport au profil de l'utilisateur
- Considère la description de l'activité pour comprendre son champ d'application
- Prends en compte le type de localisation (en personne, à distance, hybride) si pertinent
- Évalue la pertinence globale, pas seulement une correspondance partielle
- IMPORTANT: Ne te base PAS QUE sur la notoriété ou la déclaration de l'activité. Certaines activités peuvent être créées et pas forcément connues du grand public, mais si les mots-clés et les bénéfices semblent pertinents par rapport au contexte utilisateur, tu dois les mettre en avant. La pertinence se juge principalement sur la correspondance des mots-clés et des bénéfices, pas uniquement sur la popularité.

Retourne uniquement les activités avec un score de pertinence >= 7/10.`;

    // Appeler la fonction générique de worker
    const workerResults = await this.retrieveDataFromAgentWorkerSearch(
      allActivities,
      allChunksTexts, // Contexte utilisateur = chunks
      activityToText,
      context,
      workerInstruction,
      itemsPerWorker, // 10 activités par worker
      0.7, // Score minimum 7/10
      15  // Top 15 résultats
    );
    
    // Convertir les résultats en ActivitySearchResult
    const workerActivities = workerResults.results.map(result => {
      const activity = result.item;
      
      return {
        type: 'activity' as const,
        id: activity.id,
        title: activity.title,
        shortDescription: activity.shortDescription || undefined,
        longDescription: activity.longDescription || undefined,
        benefits: activity.benefits,
        locationType: activity.locationType || undefined,
        address: activity.address || undefined,
        practiceId: activity.practiceId || null,
        creatorId: activity.creatorId || null,
        relevanceScore: result.confidenceScore, // Score de confiance du worker (0-1)
        similarity: result.confidenceScore,
        vectorSimilarity: null,
        bm25Similarity: null,
        matchCount: 1,
        workerReasons: result.reasons, // Raisons du worker
        source: 'worker' as const, // Indiquer la provenance
        typicalSituations: activity.typicalSituations || undefined
      } as ActivitySearchResult & { workerReasons?: string[]; source?: 'semantic' | 'worker' };
    });
    
    console.log(`✅ [WORKER] ${workerActivities.length} activités pertinentes trouvées via workers IA`);
    
    return workerActivities;
  }

  /**
   * Calcule l'univers du bilan en réalisant une recherche sémantique sur tous les chunks de l'intent
   * et en classant les familles par dominance par rapport aux pratiques et hower angels trouvés
   * @param intent L'intent contenant les chunks
   * @param questionResponses Le tableau contenant toutes les questions et réponses de l'utilisateur (de tous les questionnaires)
   * @param questionnaires Tous les questionnaires utilisés pour ce bilan
   * @param totalQuestions Le nombre total de questions dans le dernier questionnaire
   * @param answeredQuestions Le nombre de questions répondues dans le dernier questionnaire
   */
  /**
   * Vérifie la réponse à la question sur les animaux (index 6) et détermine si on doit considérer les animaux
   * @param questionResponses Les réponses aux questions du questionnaire
   * @param _currentQuestionnaire Le questionnaire courant (non utilisé pour le moment)
   * @returns Le statut de la réponse concernant les animaux
   */
  protected checkAnimalResponse(
    questionResponses: BilanQuestionnaireAnswers,
    _currentQuestionnaire: BilanQuestionnaireWithChunks
  ): AnimalResponseStatus {
    // Identifier la question sur les animaux dans INITIAL_BILAN_QUESTIONS
    // C'est la question à l'index 6 : "🐾 Avez-vous un compagnon à quatre pattes ?"
    const animalQuestionIndex = 6;
    
    // Trouver la réponse correspondante à cette question
    const animalResponse = questionResponses.find(qr => qr.questionIndex === animalQuestionIndex);
    
    if (!animalResponse) {
      // Si aucune réponse n'a été donnée à cette question
      return AnimalResponseStatus.NotAnswered;
    }
    
    // Vérifier si la réponse correspond à "🚫 Non, pas pour l'instant" (answerIndex = 1)
    // Dans INITIAL_BILAN_QUESTIONS, l'index 0 = "Oui, j'aimerais aussi prendre soin de mon animal"
    // et l'index 1 = "Non, pas pour l'instant"
    if (animalResponse.answerIndex === 1) {
      console.log(`🐾 [BILAN] Réponse négative aux animaux détectée: "Non, pas pour l'instant"`);
      return AnimalResponseStatus.NoAnimal;
    }
    
    // Si answerIndex === 0 ou autre réponse positive
    if (animalResponse.answerIndex === 0) {
      console.log(`🐾 [BILAN] Réponse positive aux animaux détectée: "Oui, j'aimerais aussi prendre soin de mon animal"`);
      return AnimalResponseStatus.Animal;
    }
    
    // Par défaut, considérer comme positif si une réponse existe
    return AnimalResponseStatus.Animal;
  }

  /**
   * Vérifie si un élément (pratique, spécialité, activité) appartient à pet-care
   * @param item L'élément à vérifier
   * @returns true si l'élément appartient à pet-care
   */
  protected isPetCare(item: any): boolean {
    const familyId = (item.familyId || '').toLowerCase();
    const familyName = (item.familyName || '').toLowerCase();
    return familyId.includes('pet') || familyId.includes('animal') || 
           familyName.includes('pet') || familyName.includes('animal');
  }

  /**
   * Filtre les pratiques pour exclure celles de pet-care
   * @param practices Liste des pratiques à filtrer
   * @returns Liste des pratiques sans pet-care
   */
  protected filterPracticesPetCare<T = any>(practices: T[]): T[] {
    return practices.filter((p: any) => !this.isPetCare(p));
  }

  /**
   * Filtre les howerAngels en excluant complètement ceux qui ont des spécialités ou activités pet-care
   * @param howerAngels Liste des howerAngels à filtrer
   * @returns Liste des howerAngels sans ceux qui ont pet-care
   */
  protected filterHowerAngelsPetCareExclude(howerAngels: any[]): any[] {
    return howerAngels.filter(howerAngel => {
      // Vérifier les spécialités
      if (howerAngel.specialties && Array.isArray(howerAngel.specialties)) {
        const hasPetCareSpecialty = howerAngel.specialties.some((specialty: any) => this.isPetCare(specialty));
        if (hasPetCareSpecialty) return false;
      }
      
      // Vérifier les activités
      if (howerAngel.activities && Array.isArray(howerAngel.activities)) {
        const hasPetCareActivity = howerAngel.activities.some((activity: any) => this.isPetCare(activity));
        if (hasPetCareActivity) return false;
      }
      
      return true;
    });
  }

  /**
   * Filtre les howerAngels en excluant les spécialités et activités pet-care, puis exclut ceux qui n'ont plus de spécialités
   * @param howerAngelsList Liste des howerAngels à filtrer
   * @returns Liste des howerAngels avec spécialités/activités pet-care filtrées
   */
  protected filterHowerAngelsPetCareFilter(howerAngelsList: HowerAngelSearchResult[]): HowerAngelSearchResult[] {
    return howerAngelsList.map(ha => {
      // Filtrer les spécialités pet-care
      if (ha.specialties && Array.isArray(ha.specialties)) {
        ha.specialties = ha.specialties.filter((s: any) => !this.isPetCare(s));
      }
      // Filtrer les activités pet-care
      if (ha.activities && Array.isArray(ha.activities)) {
        ha.activities = ha.activities.filter((a: any) => !this.isPetCare(a));
      }
      return ha;
    }).filter(ha => {
      // Exclure le howerAngel si après filtrage il n'a plus de spécialités
      if (ha.specialties && Array.isArray(ha.specialties)) {
        return ha.specialties.length > 0;
      }
      return true;
    });
  }

  protected async computeUniverse(
    intent: BilanQuestionIntent, 
    questionResponses?: Array<{ question: string; index: number; response: string }>,
    questionnaires?: BilanQuestionnaireWithChunks[],
    totalQuestions?: number,
    answeredQuestions?: number,
    context?: HowanaContext
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
    // Les chunks sont déjà combinés de tous les questionnaires avant l'appel à computeUniverse
    const chunks = intent?.universContext?.chunks || [];
    
    console.log(`📋 [BILAN] computeUniverse - ${chunks.length} chunks, ${questionResponses?.length || 0} réponses, ${questionnaires?.length || 0} questionnaires`);
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
    
    // Extraire l'adresse ou la position GPS depuis les réponses du questionnaire
    let address: string | undefined;
    let gpsPosition: { latitude: number; longitude: number } | undefined;
    
    // Parcourir les réponses pour trouver l'adresse ou la position GPS
    // Note: Pour l'instant, l'adresse/GPS n'est pas utilisée directement dans les recherches
    // mais est stockée pour utilisation future
    if (questionResponses && context) {
      // Chercher dans le contexte les réponses du questionnaire original
      const questionnaireData = context.metadata?.['questionnaireAnswers'] as BilanQuestionnaireUserAnswers | undefined;
      const questionnaireAnswers = questionnaireData?.answers;
        
        if (questionnaireAnswers) {
          for (const answer of questionnaireAnswers) {
            console.log(`📍 [BILAN] Réponse du questionnaire: ${JSON.stringify(answer)}`);
            if (answer.moreResponseType === 'address' && answer.moreResponse) {
              address = answer.moreResponse;
            } else if (answer.moreResponseType === 'gps' && answer.moreResponse) {
              try {
                const gpsData = JSON.parse(answer.moreResponse);
                if (gpsData.latitude && gpsData.longitude) {
                  gpsPosition = { latitude: gpsData.latitude, longitude: gpsData.longitude };
                }
              } catch (e) {
                console.warn('⚠️ [BILAN] Erreur lors du parsing de la position GPS:', e);
              }
            }
          }
        }
    }
    
    if (address) {
      console.log(`📍 [BILAN] Adresse trouvée pour la recherche: ${address}`);
    } else if (gpsPosition) {
      console.log(`📍 [BILAN] Position GPS trouvée pour la recherche: ${gpsPosition.latitude}, ${gpsPosition.longitude}`);
    } else {
      console.log(`📍 [BILAN] Aucune adresse ou position GPS trouvée pour la recherche`);
    }
    
    // Vérifier si on doit exclure pet-care
    const animalUniverseStatus = context?.metadata?.['animalUniverseStatus'] as AnimalResponseStatus | undefined;
    const shouldExcludePetCare = animalUniverseStatus === AnimalResponseStatus.NoAnimal;
    
    if (shouldExcludePetCare) {
      console.log(`🐾 [BILAN] Exclusion de pet-care: pas d'animaux à considérer`);
    }
    
    // 1. Récupérer toutes les données de la base de données pour les recherches agentiques
    console.log(`🔍 [BILAN] Récupération de toutes les données depuis la base de données`);
    const [allHowerAngelsResult, allPracticesResult, allActivitiesResult] = await Promise.all([
      this.supabaseService.getAllHowerAngels(),
      this.supabaseService.getAllPracticesWithFullInfo(),
      this.supabaseService.getAllActivitiesWithFullInfo()
    ]);
    
    let allHowerAngels = allHowerAngelsResult.success && allHowerAngelsResult.data ? allHowerAngelsResult.data : [];
    let allPractices = allPracticesResult.success && allPracticesResult.data ? allPracticesResult.data : [];
    const allActivities = allActivitiesResult.success && allActivitiesResult.data ? allActivitiesResult.data : [];
    
    // Filtrer pet-care avant les recherches si nécessaire
    if (shouldExcludePetCare) {
      allPractices = this.filterPracticesPetCare(allPractices);
      allHowerAngels = this.filterHowerAngelsPetCareExclude(allHowerAngels);
      console.log(`🐾 [BILAN] Filtrage pet-care: ${allPractices.length} pratiques et ${allHowerAngels.length} hower angels restants`);
    }
    
    console.log(`✅ [BILAN] ${allHowerAngels.length} hower angels, ${allPractices.length} pratiques et ${allActivities.length} activités récupérés`);
    
    // 2. Recherche sémantique et agentique en parallèle pour optimiser les coûts dans le cloud
    console.log(`🚀 [BILAN] Lancement des recherches sémantique et agentique en parallèle`);
    
    const [semanticResults, workerPracticesResult, workerHowerAngelsResult, workerActivitiesResult] = await Promise.all([
      // Recherche sémantique (méthode actuelle)
      this.retrieveDataFromSemanticSearch(allChunksTexts),
      // Recherche via workers IA pour les pratiques - seulement si context est disponible
      context ? this.retrieveDataFromAgentWorkerSearchForPractices(allChunksTexts, context, [], allPractices) : Promise.resolve([]),
      // Recherche via workers IA pour les hower angels - seulement si context est disponible
      context ? this.retrieveDataFromAgentWorkerSearchForHowerAngels(allChunksTexts, context, allHowerAngels) : Promise.resolve([]),
      // Recherche via workers IA pour les activités - seulement si context est disponible
      context ? this.retrieveDataFromAgentWorkerSearchForActivities(allChunksTexts, context, allActivities) : Promise.resolve([])
    ]);
    
    let semanticPractices: PracticeSearchResult[] = semanticResults.practices;
    let activities: ActivitySearchResult[] = semanticResults.activities;
    let howerAngels: HowerAngelSearchResult[] | HowerAngelWithDistance[] = semanticResults.howerAngels;
    let workerPractices: PracticeSearchResult[] = workerPracticesResult;
    let workerHowerAngels: HowerAngelSearchResult[] = workerHowerAngelsResult;
    let workerActivities: ActivitySearchResult[] = workerActivitiesResult;
    
    // Filtrer pet-care des résultats si nécessaire
    if (shouldExcludePetCare) {
      // Filtrer les pratiques sémantiques et des workers
      semanticPractices = this.filterPracticesPetCare(semanticPractices);
      workerPractices = this.filterPracticesPetCare(workerPractices);
      
      // Filtrer les howerAngels sémantiques et des workers (filtrer les spécialités/activités pet-care)
      howerAngels = this.filterHowerAngelsPetCareFilter(howerAngels as HowerAngelSearchResult[]);
      workerHowerAngels = this.filterHowerAngelsPetCareFilter(workerHowerAngels);
      
      console.log(`🐾 [BILAN] Filtrage pet-care des résultats: ${semanticPractices.length} pratiques sémantiques, ${workerPractices.length} pratiques workers, ${howerAngels.length} hower angels sémantiques, ${workerHowerAngels.length} hower angels workers`);
    }

    // Enrichir les données avec les adresses depuis la base de données
    try {
      const supabaseClient = (this.supabaseService as any).supabase;
      
      if (supabaseClient) {
        console.log(`📍 [BILAN] Enrichissement des données avec les adresses depuis la base de données`);
        
        // Enrichir les hower angels avec leurs adresses
        if (howerAngels.length > 0) {
          howerAngels = await this.howerAngelService.enrichHowerAngelsWithAddresses(
            howerAngels as HowerAngelSearchResult[],
            supabaseClient
          );
        }
        
        // Enrichir les hower angels workers avec leurs adresses
        if (workerHowerAngels.length > 0) {
          workerHowerAngels = await this.howerAngelService.enrichHowerAngelsWithAddresses(
            workerHowerAngels,
            supabaseClient
          );
        }
        
        // Enrichir les activités avec leurs adresses
        if (activities.length > 0) {
          activities = await this.activityService.enrichActivitiesWithAddresses(
            activities,
            supabaseClient
          );
        }
        
        // Enrichir les activités workers avec leurs adresses
        if (workerActivities.length > 0) {
          workerActivities = await this.activityService.enrichActivitiesWithAddresses(
            workerActivities,
            supabaseClient
          ) as ActivitySearchResult[];
        }
        
        console.log(`✅ [BILAN] Données enrichies avec les adresses`);
      }
    } catch (error) {
      console.warn('⚠️ [BILAN] Erreur lors de l\'enrichissement des données avec les adresses:', error);
    }
    
    // 2. Calculer les distances pour les hower angels trouvés par recherche sémantique
    // et réordonnancer par distance si une adresse ou GPS est disponible
    if ((address || gpsPosition) && howerAngels.length > 0) {
      console.log(`📍 [BILAN] Calcul des distances pour ${howerAngels.length} hower angels (recherche sémantique)`);
      
      try {
        // Accéder au client Supabase via une propriété protégée ou une méthode publique
        // Note: On utilise une assertion de type pour accéder à la propriété privée
        const supabaseClient = (this.supabaseService as any).supabase;
        
        const howerAngelsBefore = howerAngels.filter((ha: any) => ha.distanceFromOrigin).length;
        if (address) {
          howerAngels = await this.howerAngelService.associateDistancesFromAddress(
            howerAngels,
            address,
            supabaseClient
          );
        } else if (gpsPosition) {
          howerAngels = await this.howerAngelService.associateDistancesFromCoordinates(
            howerAngels,
            { lat: gpsPosition.latitude, lng: gpsPosition.longitude },
            supabaseClient
          );
        }
        const howerAngelsAfter = howerAngels.filter((ha: any) => ha.distanceFromOrigin).length;
        console.log(`✅ [BILAN] Distances calculées pour les hower angels (recherche sémantique): ${howerAngelsBefore} -> ${howerAngelsAfter} hower angels avec distance`);
      } catch (error) {
        console.warn('⚠️ [BILAN] Erreur lors du calcul des distances pour les hower angels sémantiques:', error);
      }
    }
    
    // 3. Calculer les distances pour les hower angels trouvés par recherche agentique
    if ((address || gpsPosition) && workerHowerAngels.length > 0) {
      console.log(`📍 [BILAN] Calcul des distances pour ${workerHowerAngels.length} hower angels (recherche agentique)`);
      
      try {
        // Accéder au client Supabase via une propriété protégée ou une méthode publique
        const supabaseClient = (this.supabaseService as any).supabase;
        let workerHowerAngelsWithDistances: HowerAngelWithDistance[] = [];
        
        if (address) {
          workerHowerAngelsWithDistances = await this.howerAngelService.associateDistancesFromAddress(
            workerHowerAngels,
            address,
            supabaseClient
          );
        } else if (gpsPosition) {
          workerHowerAngelsWithDistances = await this.howerAngelService.associateDistancesFromCoordinates(
            workerHowerAngels,
            { lat: gpsPosition.latitude, lng: gpsPosition.longitude },
            supabaseClient
          );
        }
        
        // Combiner les hower angels workers avec les sémantiques (éviter les doublons par ID)
        const howerAngelsMap = new Map<string, HowerAngelSearchResult>();
        
        // Ajouter d'abord les hower angels sémantiques
        howerAngels.forEach(ha => {
          howerAngelsMap.set(ha.id, ha);
        });
        
        // Ajouter les hower angels workers (peuvent compléter les sémantiques)
        workerHowerAngelsWithDistances.forEach(ha => {
          const existing = howerAngelsMap.get(ha.id);
          if (existing) {
            // Si la hower angel existe déjà, on garde la sémantique et on ajoute les infos du worker
            (existing as any).workerReasons = (ha as any).workerReasons;
            (existing as any).source = 'semantic'; // On garde 'semantic' comme source principale
          } else {
            howerAngelsMap.set(ha.id, ha);
          }
        });
        
        howerAngels = Array.from(howerAngelsMap.values());
        
        console.log(`✅ [BILAN] Distances calculées pour les hower angels (recherche agentique), total: ${howerAngels.length}`);
      } catch (error) {
        console.warn('⚠️ [BILAN] Erreur lors du calcul des distances pour les hower angels workers:', error);
        // En cas d'erreur, combiner quand même les listes sans distance
        const howerAngelsMap = new Map<string, HowerAngelSearchResult>();
        howerAngels.forEach(ha => howerAngelsMap.set(ha.id, ha));
        workerHowerAngels.forEach(ha => {
          if (!howerAngelsMap.has(ha.id)) {
            howerAngelsMap.set(ha.id, ha);
          }
        });
        howerAngels = Array.from(howerAngelsMap.values());
      }
    } else if (workerHowerAngels.length > 0) {
      // Si pas d'adresse/GPS, combiner quand même les listes
      const howerAngelsMap = new Map<string, HowerAngelSearchResult>();
      howerAngels.forEach(ha => howerAngelsMap.set(ha.id, ha));
      workerHowerAngels.forEach(ha => {
        if (!howerAngelsMap.has(ha.id)) {
          howerAngelsMap.set(ha.id, ha);
        }
      });
      howerAngels = Array.from(howerAngelsMap.values());
    }
    
    // Type pour les pratiques avec source et workerReasons
    type PracticeWithSource = PracticeSearchResult & { source?: 'semantic' | 'worker'; workerReasons?: string[] };
    
    // Enrichir les pratiques workers avec les infos sémantiques si disponibles
    const enrichedWorkerPractices = workerPractices.map(workerPractice => {
      const semanticPractice = semanticPractices.find(p => p.id === workerPractice.id);
      if (semanticPractice) {
        return {
          ...workerPractice,
          categoryId: semanticPractice.categoryId ?? workerPractice.categoryId ?? null,
          categoryName: semanticPractice.categoryName ?? workerPractice.categoryName ?? null,
          categoryDescription: semanticPractice.categoryDescription ?? workerPractice.categoryDescription ?? null,
          familyId: semanticPractice.familyId ?? workerPractice.familyId ?? null,
          familyName: semanticPractice.familyName ?? workerPractice.familyName ?? null,
          familyDescription: semanticPractice.familyDescription ?? workerPractice.familyDescription ?? null
        } as PracticeWithSource;
      }
      return workerPractice;
    });
    
    // Utiliser les pratiques enrichies
    const finalWorkerPractices: PracticeWithSource[] = enrichedWorkerPractices;
    
    // Combiner les deux sources de pratiques avec leur provenance
    // Marquer les pratiques sémantiques avec leur source
    const semanticPracticesWithSource: PracticeWithSource[] = semanticPractices.map(p => ({
      ...p,
      source: 'semantic' as const
    })) as PracticeWithSource[];
    
    // Combiner les deux listes (en évitant les doublons par ID)
    const practicesMap = new Map<string, PracticeWithSource>();
    
    // Ajouter d'abord les pratiques sémantiques
    semanticPracticesWithSource.forEach(p => {
      practicesMap.set(p.id, p);
    });
    
    // Ajouter les pratiques workers (peuvent compléter les sémantiques)
    finalWorkerPractices.forEach(p => {
      const existing = practicesMap.get(p.id);
      if (existing) {
        // Si la pratique existe déjà, on garde la pratique sémantique et on ajoute les infos du worker
        if (p.workerReasons !== undefined) {
          existing.workerReasons = p.workerReasons;
        }
        // On garde 'semantic' comme source principale, mais on note qu'on a aussi les raisons du worker
      } else {
        practicesMap.set(p.id, p);
      }
    });
    
    let practices: Array<PracticeSearchResult & { source?: 'semantic' | 'worker'; workerReasons?: string[]; distanceFromOrigin?: DistanceResult }> = Array.from(practicesMap.values());
    
    // Type pour les activités avec source et workerReasons
    type ActivityWithSource = ActivitySearchResult & { source?: 'semantic' | 'worker'; workerReasons?: string[] };
    
    // Enrichir les activités workers avec les infos sémantiques si disponibles
    const enrichedWorkerActivities = workerActivities.map(workerActivity => {
      const semanticActivity = activities.find(a => a.id === workerActivity.id);
      if (semanticActivity) {
        return {
          ...workerActivity,
          categoryId: semanticActivity.categoryId ?? workerActivity.categoryId ?? null,
          categoryName: semanticActivity.categoryName ?? workerActivity.categoryName ?? null,
          categoryDescription: semanticActivity.categoryDescription ?? workerActivity.categoryDescription ?? null,
          familyId: semanticActivity.familyId ?? workerActivity.familyId ?? null,
          familyName: semanticActivity.familyName ?? workerActivity.familyName ?? null,
          familyDescription: semanticActivity.familyDescription ?? workerActivity.familyDescription ?? null,
          practiceId: semanticActivity.practiceId ?? workerActivity.practiceId ?? null,
          practiceTitle: semanticActivity.practiceTitle ?? workerActivity.practiceTitle ?? null,
          practiceShortDescription: semanticActivity.practiceShortDescription ?? workerActivity.practiceShortDescription ?? null
        } as ActivityWithSource;
      }
      return workerActivity;
    });
    
    // Utiliser les activités enrichies
    const finalWorkerActivities: ActivityWithSource[] = enrichedWorkerActivities;
    
    // Combiner les deux sources d'activités avec leur provenance
    // Marquer les activités sémantiques avec leur source
    const semanticActivitiesWithSource: ActivityWithSource[] = activities.map(a => ({
      ...a,
      source: 'semantic' as const
    })) as ActivityWithSource[];
    
    // Combiner les deux listes (en évitant les doublons par ID)
    const activitiesMap = new Map<string, ActivityWithSource>();
    
    // Ajouter d'abord les activités sémantiques
    semanticActivitiesWithSource.forEach(a => {
      activitiesMap.set(a.id, a);
    });
    
    // Ajouter les activités workers (peuvent compléter les sémantiques)
    finalWorkerActivities.forEach(a => {
      const existing = activitiesMap.get(a.id);
      if (existing) {
        // Si l'activité existe déjà, on garde la sémantique et on ajoute les infos du worker
        if (a.workerReasons !== undefined) {
          existing.workerReasons = a.workerReasons;
        }
        // On garde 'semantic' comme source principale, mais on note qu'on a aussi les raisons du worker
      } else {
        activitiesMap.set(a.id, a);
      }
    });
    
    activities = Array.from(activitiesMap.values());
    
    // 4. Calculer les distances pour tous les hower angels récupérés précédemment
    // pour les utiliser dans les calculs de distances des pratiques et activités
    let allHowerAngelsWithDistances: HowerAngelWithDistance[] = [];
    if ((address || gpsPosition) && allHowerAngels.length > 0) {
      try {
        console.log(`📍 [BILAN] Calcul des distances pour ${allHowerAngels.length} hower angels`);
        
        const supabaseClient = (this.supabaseService as any).supabase;
        
        // Enrichir avec les adresses
        let enrichedHowerAngels = await this.howerAngelService.enrichHowerAngelsWithAddresses(
          allHowerAngels,
          supabaseClient
        );
        
        // Calculer les distances pour tous les hower angels
        if (address) {
          allHowerAngelsWithDistances = await this.howerAngelService.associateDistancesFromAddress(
            enrichedHowerAngels,
            address,
            supabaseClient
          );
        } else if (gpsPosition) {
          allHowerAngelsWithDistances = await this.howerAngelService.associateDistancesFromCoordinates(
            enrichedHowerAngels,
            { lat: gpsPosition.latitude, lng: gpsPosition.longitude },
            supabaseClient
          );
        }
        
        console.log(`✅ [BILAN] ${allHowerAngelsWithDistances.length} hower angels avec distances calculées`);
      } catch (error) {
        console.warn('⚠️ [BILAN] Erreur lors de la récupération de tous les hower angels:', error);
      }
    }
    
    // 5. Calculer les distances pour les pratiques pertinentes
    // en trouvant les hower angels qui les proposent et en prenant la distance la plus courte
    // Utiliser tous les hower angels de la base de données (pas seulement ceux de la recherche sémantique)
    if ((address || gpsPosition) && practices.length > 0 && allHowerAngelsWithDistances.length > 0) {
      console.log(`📍 [BILAN] Calcul des distances pour ${practices.length} pratiques`);
      
      try {
        const practicesBefore = practices.filter((p: any) => p.distanceFromOrigin).length;
        practices = this.practiceService.associateDistancesToPractices(
          practices,
          allHowerAngelsWithDistances
        );
        const practicesAfter = practices.filter((p: any) => p.distanceFromOrigin).length;
        console.log(`✅ [BILAN] Distances calculées pour les pratiques: ${practicesBefore} -> ${practicesAfter} pratiques avec distance`);
      } catch (error) {
        console.warn('⚠️ [BILAN] Erreur lors du calcul des distances pour les pratiques:', error);
      }
    }
    
    // 6. Calculer les distances pour les activités pertinentes
    // Logique : utiliser l'adresse de l'activité si disponible, sinon celle du créateur (hower angel)
    // Utiliser tous les hower angels de la base de données (pas seulement ceux de la recherche sémantique)
    if ((address || gpsPosition) && activities.length > 0 && allHowerAngelsWithDistances.length > 0) {
      console.log(`📍 [BILAN] Calcul des distances pour ${activities.length} activités`);
      
      try {
        // Accéder au client Supabase via une propriété protégée ou une méthode publique
        const supabaseClient = (this.supabaseService as any).supabase;
        
        // Convertir allHowerAngelsWithDistances en format attendu
        const howerAngelsForActivities = allHowerAngelsWithDistances as Array<HowerAngelSearchResult & { distanceFromOrigin?: DistanceResult }>;
        
        const activitiesBefore = activities.filter((a: any) => a.distanceFromOrigin).length;
        if (address) {
          activities = await this.activityService.associateDistancesFromAddress(
            activities,
            address,
            supabaseClient,
            howerAngelsForActivities
          );
        } else if (gpsPosition) {
          activities = await this.activityService.associateDistancesFromCoordinates(
            activities,
            { lat: gpsPosition.latitude, lng: gpsPosition.longitude },
            supabaseClient,
            howerAngelsForActivities
          );
        }
        const activitiesAfter = activities.filter((a: any) => a.distanceFromOrigin).length;
        console.log(`✅ [BILAN] Distances calculées pour les activités: ${activitiesBefore} -> ${activitiesAfter} activités avec distance`);
      } catch (error) {
        console.warn('⚠️ [BILAN] Erreur lors du calcul des distances pour les activités:', error);
      }
    }
    
    console.log(`✅ [BILAN] ${practices.length} pratiques totales (${semanticPractices.length} sémantiques, ${workerPractices.length} workers), ${activities.length} activités et ${howerAngels.length} hower angels trouvés`);
    
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
    
    // Vérifier si on doit exclure pet-care (utiliser l'information du contexte)
    const animalUniverseStatusForFamily = context?.metadata?.['animalUniverseStatus'] as AnimalResponseStatus | undefined;
    const shouldExcludePetCareForFamily = animalUniverseStatusForFamily === AnimalResponseStatus.NoAnimal;
    
    if (shouldExcludePetCareForFamily) {
      // Trouver la famille pet-care et mettre son score à 0
      const petCareFamily = familiesWithDominance.find(f => 
        f.id.toLowerCase().includes('pet') || 
        f.name.toLowerCase().includes('pet') || 
        f.name.toLowerCase().includes('animal')
      );
      if (petCareFamily) {
        petCareFamily.dominanceScore = 0;
        console.log(`🐾 [BILAN] Famille pet-care trouvée (${petCareFamily.name}), score mis à 0 car pas d'animaux à considérer`);
      }
    }
    
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
    
    // Logs avant le mapping pour vérifier les distances
    const practicesWithDistanceBeforeMapping = practices.filter((p: any) => p.distanceFromOrigin).length;
    const activitiesWithDistanceBeforeMapping = activities.filter((a: any) => a.distanceFromOrigin).length;
    const howerAngelsWithDistanceBeforeMapping = howerAngels.filter((ha: any) => ha.distanceFromOrigin).length;
    console.log(`📊 [BILAN] computeUniverse - Distances avant mapping:`, {
      practices: practicesWithDistanceBeforeMapping,
      activities: activitiesWithDistanceBeforeMapping,
      howerAngels: howerAngelsWithDistanceBeforeMapping
    });
    
    // Enrichir les pratiques et activités avec les chunks qui ont permis le matching
    // chunkText contient le fragment de chunk de la base de données qui a matché
    // matchCount est déjà présent dans les pratiques et activités après déduplication
    // distanceFromOrigin est déjà présent si les distances ont été calculées
    const practicesWithMatchCount = practices.map((practice: PracticeSearchResult & { source?: 'semantic' | 'worker'; workerReasons?: string[]; distanceFromOrigin?: DistanceResult }) => ({
      ...practice,
      matchingChunks: practice.chunkText || null, // Fragment de chunk de la BD qui a permis le matching
      source: practice.source || 'semantic', // Provenance de la recommandation
      workerReasons: practice.workerReasons || undefined, // Raisons du worker si disponible
      // distanceFromOrigin est préservé via le spread operator ...practice
    }));
    
    const activitiesWithMatchCount = activities.map((activity: ActivitySearchResult & { distanceFromOrigin?: DistanceResult }) => ({
      ...activity,
      matchingChunks: activity.chunkText || null, // Fragment de chunk de la BD qui a permis le matching
      // distanceFromOrigin est préservé via le spread operator ...activity
    }));
    
    // Enrichir les hower angels avec les chunks qui ont permis le matching
    const howerAngelsWithChunks = howerAngels.map((howerAngel: HowerAngelSearchResult) => ({
      ...howerAngel,
      matchingChunks: howerAngel.chunkText || null // Fragment de chunk de la BD qui a permis le matching
    }));
    
    // Logs après le mapping pour vérifier que les distances sont préservées
    const practicesWithDistanceAfterMapping = practicesWithMatchCount.filter((p: any) => p.distanceFromOrigin).length;
    const activitiesWithDistanceAfterMapping = activitiesWithMatchCount.filter((a: any) => a.distanceFromOrigin).length;
    const howerAngelsWithDistanceAfterMapping = howerAngelsWithChunks.filter((ha: any) => ha.distanceFromOrigin).length;
    console.log(`📊 [BILAN] computeUniverse - Distances après mapping:`, {
      practices: practicesWithDistanceAfterMapping,
      activities: activitiesWithDistanceAfterMapping,
      howerAngels: howerAngelsWithDistanceAfterMapping
    });
    
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
        info: `Liste des pratiques bien-être HOW PASS identifiées comme pertinentes pour l'utilisateur basées sur ses réponses au questionnaire. Cette liste combine deux sources de recommandation:

1. SOURCE "semantic" (Recherche sémantique vectorielle):
   - Méthode: Recherche par similarité vectorielle basée sur les chunks extraits des réponses de l'utilisateur
   - Principe: Compare les fragments de texte des réponses avec les descriptions et situations typiques des pratiques dans la base de données
   - Avantage: Détecte les correspondances textuelles et sémantiques précises
   - Score: Basé sur la similarité vectorielle et BM25
   - Utilisation: Idéal pour trouver des pratiques correspondant à des mots-clés ou expressions spécifiques mentionnées par l'utilisateur

2. SOURCE "worker" (Analyse par workers IA):
   - Méthode: Analyse globale par des workers IA qui évaluent la pertinence de chaque pratique
   - Principe: Les workers analysent les bénéfices, situations typiques et descriptions complètes des pratiques en fonction du contexte utilisateur global
   - Avantage: Comprend la pertinence globale et les nuances, même sans correspondance textuelle exacte
   - Score: Score de confiance (0-10) basé sur une évaluation holistique
   - Raisons: Chaque pratique worker inclut des raisons détaillées expliquant pourquoi elle est pertinente
   - Utilisation: Idéal pour découvrir des pratiques pertinentes même si l'utilisateur ne les a pas mentionnées explicitement

Chaque pratique inclut:
- Un score de pertinence
- Un compteur de matchs (pour les pratiques semantic)
- La source de la recommandation (semantic, worker)
- Les raisons de pertinence (pour les pratiques worker)
- Les fragments de chunks qui ont permis le matching (pour les pratiques semantic)

Tu peux utiliser les deux sources pour enrichir tes recommandations. Les pratiques "semantic" sont souvent plus précises mais peuvent manquer des opportunités, tandis que les pratiques "worker" peuvent révéler des pratiques pertinentes que l'utilisateur n'aurait pas pensé à mentionner.`,
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
    
    // Logs pour vérifier le nombre de données avec distance avant le return final
    const practicesWithDistance = practicesWithMatchCount.filter((p: any) => p.distanceFromOrigin !== undefined && p.distanceFromOrigin !== null).length;
    const activitiesWithDistance = activitiesWithMatchCount.filter((a: any) => a.distanceFromOrigin !== undefined && a.distanceFromOrigin !== null).length;
    const howerAngelsWithDistance = howerAngelsWithChunks.filter((ha: any) => ha.distanceFromOrigin !== undefined && ha.distanceFromOrigin !== null).length;
    
    console.log(`📊 [BILAN] computeUniverse - Nombre de données avec distance avant return final:`, {
      practices: {
        total: practicesWithMatchCount.length,
        withDistance: practicesWithDistance,
        withoutDistance: practicesWithMatchCount.length - practicesWithDistance
      },
      activities: {
        total: activitiesWithMatchCount.length,
        withDistance: activitiesWithDistance,
        withoutDistance: activitiesWithMatchCount.length - activitiesWithDistance
      },
      howerAngels: {
        total: howerAngelsWithChunks.length,
        withDistance: howerAngelsWithDistance,
        withoutDistance: howerAngelsWithChunks.length - howerAngelsWithDistance
      }
    });
    
    return result;
  }

  /**
   * Valide une réponse IA générée
   * @param response La réponse IA à valider
   * @param context Le contexte de la conversation
   * @returns Un objet contenant isValid (boolean), reason (string optionnel) et finalObject (T optionnel)
   */
  protected override async validateResponse(
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

    // Enrichir la réponse avec les distances depuis l'univers
    // Récupérer l'univers depuis les métadonnées
    const bilanUniverContext = context.metadata?.['globalIntentInfos']?.bilanUniverContext as BilanUniverContext | undefined;
    
    if (bilanUniverContext) {
      // Créer une map simplifiée des distances : ID -> DistanceResult
      const distancesMap = new Map<string, DistanceResult>();
      
      // Extraire les distances des pratiques
      const practices = bilanUniverContext.practices?.value || [];
      practices.forEach((practice: any) => {
        if (practice.id && practice.distanceFromOrigin) {
          distancesMap.set(`practice:${practice.id}`, practice.distanceFromOrigin);
        }
      });
      
      // Extraire les distances des activités
      const activities = bilanUniverContext.activities?.value || [];
      activities.forEach((activity: any) => {
        if (activity.id && activity.distanceFromOrigin) {
          distancesMap.set(`activity:${activity.id}`, activity.distanceFromOrigin);
        }
      });
      
      // Extraire les distances des hower angels
      const howerAngels = bilanUniverContext.howerAngels?.value || [];
      howerAngels.forEach((howerAngel: any) => {
        if (howerAngel.id && howerAngel.distanceFromOrigin) {
          distancesMap.set(`howerAngel:${howerAngel.id}`, howerAngel.distanceFromOrigin);
        }
      });
      
      // Stocker la map des distances dans le contexte pour utilisation future
      context.metadata = {
        ...context.metadata,
        distancesMap: Object.fromEntries(distancesMap)
      };
      
      // Enrichir la réponse si c'est un summary
      try {
        const responseText = response.response;
        if (responseText && typeof responseText === 'string') {
          let parsedResponse: any;
          try {
            parsedResponse = JSON.parse(responseText);
          } catch {
            // Si ce n'est pas du JSON, on ne fait rien
            return {
              isValid: true
            };
          }
          
          // Vérifier si c'est un summary de bilan
          let summary: any = null;
          if (parsedResponse.summary && typeof parsedResponse.summary === 'object') {
            summary = parsedResponse.summary;
          } else if (parsedResponse.recommendation && typeof parsedResponse.recommendation === 'object') {
            summary = parsedResponse;
          }
          
          if (summary && summary.recommendation) {
            // Enrichir top1Recommandation avec la distance
            if (summary.recommendation.top1Recommandation) {
              const top1 = summary.recommendation.top1Recommandation;
              const distanceKey = top1.type === 'activity' 
                ? `activity:${top1.id}` 
                : `practice:${top1.id}`;
              const distance = distancesMap.get(distanceKey);
              if (distance) {
                top1.distance = distance;
              }
            }
            
            // Enrichir topRecommendedPanel avec les distances
            if (summary.recommendation.topRecommendedPanel) {
              const panel = summary.recommendation.topRecommendedPanel;
              
              if (panel.orderedTopPractices) {
                panel.orderedTopPractices.forEach((practice: any) => {
                  const distance = distancesMap.get(`practice:${practice.id}`);
                  if (distance) {
                    practice.distance = distance;
                  }
                });
              }
              
              if (panel.orderedTopActivities) {
                panel.orderedTopActivities.forEach((activity: any) => {
                  const distance = distancesMap.get(`activity:${activity.id}`);
                  if (distance) {
                    activity.distance = distance;
                  }
                });
              }
            }
            
            // Enrichir byFamilyRecommendedPanel avec les distances (convertir en array si nécessaire)
            if (summary.recommendation.byFamilyRecommendedPanel) {
              let byFamilyPanelToEnrich: any[] = [];
              if (Array.isArray(summary.recommendation.byFamilyRecommendedPanel)) {
                byFamilyPanelToEnrich = summary.recommendation.byFamilyRecommendedPanel;
              } else if (typeof summary.recommendation.byFamilyRecommendedPanel === 'object') {
                // Convertir l'objet en array avec familyId comme propriété
                byFamilyPanelToEnrich = Object.entries(summary.recommendation.byFamilyRecommendedPanel).map(([familyId, familyData]: [string, any]) => ({
                  familyId,
                  ...familyData
                }));
                // Mettre à jour pour que le frontend reçoive un array
                summary.recommendation.byFamilyRecommendedPanel = byFamilyPanelToEnrich;
              }
              
              byFamilyPanelToEnrich.forEach((family: any) => {
                if (family.orderedRecommendedPractices) {
                  family.orderedRecommendedPractices.forEach((practice: any) => {
                    const distance = distancesMap.get(`practice:${practice.id}`);
                    if (distance) {
                      practice.distance = distance;
                    }
                  });
                }
                
                if (family.orderedRecommendedActivities) {
                  family.orderedRecommendedActivities.forEach((activity: any) => {
                    const distance = distancesMap.get(`activity:${activity.id}`);
                    if (distance) {
                      activity.distance = distance;
                    }
                  });
                }
              });
            }
            
            // Reconstruire la réponse avec les distances enrichies
            const enrichedResponse: RecommendationMessageResponse = {
              ...response,
              response: JSON.stringify(parsedResponse)
            };
            
            return {
              isValid: true,
              finalObject: enrichedResponse
            };
          }
        }
      } catch (error) {
        console.warn('⚠️ [BILAN] Erreur lors de l\'enrichissement des distances:', error);
      }
    }
    
    // Toutes les validations sont passées
    return {
      isValid: true
    };
  }

  /**
   * Valide une réponse de type Summary pour le bilan
   * Vérifie que :
   * - La réponse est un format de summary valide
   * - Tous les IDs (pratiques, activités, hower angels) sont valides et existent dans le contexte
   * - Chaque pratique/activité/hower angel associé aux résultats a une distance depuis l'adresse ajoutée
   * @param response La réponse IA à valider
   * @param context Le contexte de la conversation
   * @returns Un objet contenant isValid (boolean), reason (string optionnel) et finalObject (RecommendationMessageResponse optionnel)
   */
  protected async validateSummaryResponse(
    response: RecommendationMessageResponse,
    context: HowanaContext
  ): Promise<{
    isValid: boolean;
    reason?: string;
    finalObject?: RecommendationMessageResponse;
  }> {
    // Parser la réponse JSON
    let parsedResponse: any;
    try {
      const responseText = response.response;
      if (!responseText || typeof responseText !== 'string') {
        return {
          isValid: false,
          reason: 'La réponse ne contient pas de contenu valide pour être un summary'
        };
      }
      parsedResponse = JSON.parse(responseText);
    } catch (parseError) {
      return {
        isValid: false,
        reason: 'La réponse n\'est pas un JSON valide pour être un summary'
      };
    }

    // Détecter la structure du summary
    let summary: BilanSummary | null = null;
    let recommendation: BilanRecommendation | null = null;
    
    if (parsedResponse.summary && typeof parsedResponse.summary === 'object') {
      summary = parsedResponse.summary as BilanSummary;
      recommendation = summary.recommendation || null;
    } else if (parsedResponse.recommendation && typeof parsedResponse.recommendation === 'object') {
      summary = parsedResponse as BilanSummary;
      recommendation = parsedResponse.recommendation as BilanRecommendation;
    }

    if (!summary || !recommendation || typeof recommendation !== 'object') {
      return {
        isValid: false,
        reason: 'La réponse ne contient pas d\'objet "summary" avec "recommendation" valide'
      };
    }

    // Récupérer le globalIntentInfos depuis le contexte pour vérifier les IDs
    const globalIntentInfos = context.metadata?.['globalIntentInfos'] as GlobalRecommendationIntentInfos | undefined;
    
    if (!globalIntentInfos) {
      return {
        isValid: false,
        reason: 'Impossible de valider le summary : globalIntentInfos non disponible dans le contexte'
      };
    }

    // Créer des Sets pour vérifier rapidement l'existence des IDs
    const activityIds = new Set((globalIntentInfos.activities || []).map(a => a.id));
    (globalIntentInfos.howerAngels || []).forEach(howerAngel => {
      if (howerAngel.activities && Array.isArray(howerAngel.activities)) {
        howerAngel.activities.forEach(activity => {
          if (activity.id) {
            activityIds.add(activity.id);
          }
        });
      }
    });

    const practiceIds = new Set((globalIntentInfos.practices || []).map(p => p.id));
    (globalIntentInfos.howerAngels || []).forEach(howerAngel => {
      if (howerAngel.specialties && Array.isArray(howerAngel.specialties)) {
        howerAngel.specialties.forEach(specialty => {
          if (specialty.id) {
            practiceIds.add(specialty.id);
          }
        });
      }
    });

    // Créer une map des distances : ID -> DistanceResult
    // Utiliser globalIntentInfos au lieu de bilanUniverContext
    const distancesMap = new Map<string, DistanceResult>();
    
    // Récupérer les distances depuis globalIntentInfos.activities
    (globalIntentInfos.activities || []).forEach((activity: ActivityItem & { distanceFromOrigin?: DistanceResult }) => {
      if (activity.id && activity.distanceFromOrigin) {
        distancesMap.set(activity.id, activity.distanceFromOrigin);
      }
    });
    
    // Récupérer les distances depuis globalIntentInfos.practices
    (globalIntentInfos.practices || []).forEach((practice: PracticeItem & { distanceFromOrigin?: DistanceResult }) => {
      if (practice.id && practice.distanceFromOrigin) {
        distancesMap.set(practice.id, practice.distanceFromOrigin);
      }
    });
    
    // Récupérer les distances depuis globalIntentInfos.howerAngels
    (globalIntentInfos.howerAngels || []).forEach((howerAngel: HowerAngelItem & { distanceFromOrigin?: DistanceResult }) => {
      if (howerAngel.id && howerAngel.distanceFromOrigin) {
        distancesMap.set(howerAngel.id, howerAngel.distanceFromOrigin);
      }
    });

    // Regexp pour extraire un UUID valide
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    // Fonction pour valider un ID et extraire l'UUID
    const validateAndExtractId = (id: string, type: 'activity' | 'practice'): { isValid: boolean; extractedId?: string; reason?: string } => {
      if (!id || typeof id !== 'string') {
        return { isValid: false, reason: `L'ID ${type} est manquant ou invalide` };
      }
      
      const trimmedId = id.trim();
      const uuidMatch = trimmedId.match(uuidRegex);
      
      if (!uuidMatch) {
        return { isValid: false, reason: `Impossible d'extraire un ${type}Id valide (format UUID) depuis "${trimmedId}"` };
      }
      
      const extractedId = uuidMatch[0];
      const idSet = type === 'activity' ? activityIds : practiceIds;
      
      if (!idSet.has(extractedId)) {
        return { isValid: false, reason: `Le ${type}Id "${extractedId}" n'existe pas dans le contexte` };
      }
      
      return { isValid: true, extractedId };
    };

    // Créer une map des hower angels pour haveExplanableDistance
    const howerAngelsMap = new Map<string, HowerAngelSearchResult & { distanceFromOrigin?: DistanceResult }>();
    (globalIntentInfos.howerAngels || []).forEach((howerAngel: HowerAngelItem & { distanceFromOrigin?: DistanceResult }) => {
      if (howerAngel.id) {
        // Convertir HowerAngelItem en HowerAngelSearchResult pour la compatibilité
        const howerAngelSearchResult: HowerAngelSearchResult & { distanceFromOrigin?: DistanceResult } = {
          id: howerAngel.id,
          userId: howerAngel.userId,
          ...(howerAngel.firstName !== undefined && { firstName: howerAngel.firstName }),
          ...(howerAngel.lastName !== undefined && { lastName: howerAngel.lastName }),
          ...(howerAngel.email !== undefined && { email: howerAngel.email }),
          ...(howerAngel.specialties !== undefined && { specialties: howerAngel.specialties }),
          ...(howerAngel.experience !== undefined && { experience: howerAngel.experience }),
          profile: howerAngel.profile,
          ...(howerAngel.activities !== undefined && { activities: howerAngel.activities }),
          relevanceScore: howerAngel.relevanceScore,
          similarity: 0,
          ...(howerAngel.distanceFromOrigin !== undefined && { distanceFromOrigin: howerAngel.distanceFromOrigin })
        };
        howerAngelsMap.set(howerAngel.id, howerAngelSearchResult);
        if (howerAngel.userId) {
          howerAngelsMap.set(howerAngel.userId, howerAngelSearchResult);
        }
      }
    });

    // Fonction pour vérifier qu'un élément existe dans le contexte
    // Note: Les distances ne sont jamais fournies par l'IA, elles sont calculées et ajoutées après
    const validateDistance = async (id: string, type: 'activity' | 'practice' | 'howerAngel', elementName: string): Promise<{ isValid: boolean; reason?: string }> => {
      if (!id) {
        return { isValid: false, reason: `${elementName} : l'ID est manquant` };
      }
      
      // Pour les activités, vérifier qu'elles existent dans le contexte
      if (type === 'activity') {
        if (!activityIds.has(id)) {
          return { isValid: false, reason: `${elementName} : l'activityId "${id}" n'existe pas dans le contexte` };
        }
        return { isValid: true };
      }
      
      // Pour les pratiques, vérifier qu'elles existent dans le contexte
      if (type === 'practice') {
        if (!practiceIds.has(id)) {
          return { isValid: false, reason: `${elementName} : le practiceId "${id}" n'existe pas dans le contexte` };
        }
        return { isValid: true };
      }
      
      // Pour les hower angels, vérifier qu'ils existent dans le contexte
      if (type === 'howerAngel') {
        if (!howerAngelsMap.has(id)) {
          return { isValid: false, reason: `${elementName} : le howerAngelId "${id}" n'existe pas dans le contexte` };
        }
        return { isValid: true };
      }
      
      return { isValid: true };
    };

    // Vérifier recommendedCategories (pratiques) - propriétés dynamiques qui peuvent être enrichies
    const recommendationAny = recommendation as any;
    if (recommendationAny.recommendedCategories && Array.isArray(recommendationAny.recommendedCategories)) {
      for (let i = 0; i < recommendationAny.recommendedCategories.length; i++) {
        const category = recommendationAny.recommendedCategories[i];
        if (!category || !category.id) continue;
        
        const idValidation = validateAndExtractId(category.id, 'practice');
        if (!idValidation.isValid) {
          return {
            isValid: false,
            reason: `recommendedCategories[${i}] : ${idValidation.reason || 'ID invalide'}`
          };
        }
        
        const distanceValidation = await validateDistance(idValidation.extractedId!, 'practice', `recommendedCategories[${i}]`);
        if (!distanceValidation.isValid) {
          return {
            isValid: false,
            reason: distanceValidation.reason || `Distance manquante pour recommendedCategories[${i}]`
          };
        }
      }
    }

    // Vérifier recommendedActivities - propriétés dynamiques qui peuvent être enrichies
    if (recommendationAny.recommendedActivities && Array.isArray(recommendationAny.recommendedActivities)) {
      for (let i = 0; i < recommendationAny.recommendedActivities.length; i++) {
        const activity = recommendationAny.recommendedActivities[i];
        if (!activity || !activity.id) continue;
        
        const idValidation = validateAndExtractId(activity.id, 'activity');
        if (!idValidation.isValid) {
          return {
            isValid: false,
            reason: `recommendedActivities[${i}] : ${idValidation.reason || 'ID invalide'}`
          };
        }
        
        const distanceValidation = await validateDistance(idValidation.extractedId!, 'activity', `recommendedActivities[${i}]`);
        if (!distanceValidation.isValid) {
          return {
            isValid: false,
            reason: distanceValidation.reason || `Distance manquante pour recommendedActivities[${i}]`
          };
        }
      }
    }

    // Vérifier top1Recommandation
    if (recommendation.top1Recommandation) {
      const top1 = recommendation.top1Recommandation;
      
      // Vérifier que le type est valide
      if (!top1.type || (top1.type !== 'activity' && top1.type !== 'practice')) {
        return {
          isValid: false,
          reason: `top1Recommandation : le type est manquant ou invalide (doit être 'activity' ou 'practice')`
        };
      }
      
      // Valider l'ID
      const idValidation = validateAndExtractId(top1.id, top1.type === 'activity' ? 'activity' : 'practice');
      if (!idValidation.isValid) {
        return {
          isValid: false,
          reason: `top1Recommandation : ${idValidation.reason || 'ID invalide'}`
        };
      }
      
      // Vérifier la distance
      const distanceValidation = await validateDistance(idValidation.extractedId!, top1.type, 'top1Recommandation');
      if (!distanceValidation.isValid) {
        return {
          isValid: false,
          reason: distanceValidation.reason || 'Distance manquante pour top1Recommandation'
        };
      }
    }

    // Vérifier topRecommendedPanel
    if (recommendation.topRecommendedPanel) {
      const panel = recommendation.topRecommendedPanel;
      
      if (panel.orderedTopPractices && Array.isArray(panel.orderedTopPractices)) {
        for (let i = 0; i < panel.orderedTopPractices.length; i++) {
          const practice = panel.orderedTopPractices[i];
          if (!practice || !practice.id) continue;
          
          const idValidation = validateAndExtractId(practice.id, 'practice');
          if (!idValidation.isValid) {
            return {
              isValid: false,
              reason: `topRecommendedPanel.orderedTopPractices[${i}] : ${idValidation.reason || 'ID invalide'}`
            };
          }
          
          const distanceValidation = await validateDistance(idValidation.extractedId!, 'practice', `topRecommendedPanel.orderedTopPractices[${i}]`);
          if (!distanceValidation.isValid) {
            return {
              isValid: false,
              reason: distanceValidation.reason || `Distance manquante pour topRecommendedPanel.orderedTopPractices[${i}]`
            };
          }
        }
      }
      
      if (panel.orderedTopActivities && Array.isArray(panel.orderedTopActivities)) {
        for (let i = 0; i < panel.orderedTopActivities.length; i++) {
          const activity = panel.orderedTopActivities[i];
          if (!activity || !activity.id) continue;
          
          const idValidation = validateAndExtractId(activity.id, 'activity');
          if (!idValidation.isValid) {
            return {
              isValid: false,
              reason: `topRecommendedPanel.orderedTopActivities[${i}] : ${idValidation.reason || 'ID invalide'}`
            };
          }
          
          const distanceValidation = await validateDistance(idValidation.extractedId!, 'activity', `topRecommendedPanel.orderedTopActivities[${i}]`);
          if (!distanceValidation.isValid) {
            return {
              isValid: false,
              reason: distanceValidation.reason || `Distance manquante pour topRecommendedPanel.orderedTopActivities[${i}]`
            };
          }
        }
      }
    }

    // Vérifier byFamilyRecommendedPanel et convertir l'objet en array si nécessaire
    let byFamilyPanelArray: any[] = [];
    if (recommendation.byFamilyRecommendedPanel) {
      if (Array.isArray(recommendation.byFamilyRecommendedPanel)) {
        // Déjà un array, utiliser tel quel
        byFamilyPanelArray = recommendation.byFamilyRecommendedPanel;
      } else if (typeof recommendation.byFamilyRecommendedPanel === 'object') {
        // C'est un objet, convertir en array avec familyId comme propriété
        byFamilyPanelArray = Object.entries(recommendation.byFamilyRecommendedPanel).map(([familyId, familyData]: [string, any]) => ({
          familyId,
          ...familyData
        }));
        // Mettre à jour recommendation.byFamilyRecommendedPanel pour la suite
        (recommendation as any).byFamilyRecommendedPanel = byFamilyPanelArray;
      }
    }
    
    if (byFamilyPanelArray.length > 0) {
      for (let familyIndex = 0; familyIndex < byFamilyPanelArray.length; familyIndex++) {
        const family = byFamilyPanelArray[familyIndex];
        if (!family) continue;
        
        if (family.orderedRecommendedPractices && Array.isArray(family.orderedRecommendedPractices)) {
          for (let practiceIndex = 0; practiceIndex < family.orderedRecommendedPractices.length; practiceIndex++) {
            const practice = family.orderedRecommendedPractices[practiceIndex];
            if (!practice || !practice.id) continue;
            
            const idValidation = validateAndExtractId(practice.id, 'practice');
            if (!idValidation.isValid) {
              return {
                isValid: false,
                reason: `byFamilyRecommendedPanel[${familyIndex}].orderedRecommendedPractices[${practiceIndex}] : ${idValidation.reason || 'ID invalide'}`
              };
            }
            
            const distanceValidation = await validateDistance(idValidation.extractedId!, 'practice', `byFamilyRecommendedPanel[${familyIndex}].orderedRecommendedPractices[${practiceIndex}]`);
            if (!distanceValidation.isValid) {
              return {
                isValid: false,
                reason: distanceValidation.reason || `Distance manquante pour byFamilyRecommendedPanel[${familyIndex}].orderedRecommendedPractices[${practiceIndex}]`
              };
            }
          }
        }
        
        if (family.orderedRecommendedActivities && Array.isArray(family.orderedRecommendedActivities)) {
          for (let activityIndex = 0; activityIndex < family.orderedRecommendedActivities.length; activityIndex++) {
            const activity = family.orderedRecommendedActivities[activityIndex];
            if (!activity || !activity.id) continue;
            
            const idValidation = validateAndExtractId(activity.id, 'activity');
            if (!idValidation.isValid) {
              return {
                isValid: false,
                reason: `byFamilyRecommendedPanel[${familyIndex}].orderedRecommendedActivities[${activityIndex}] : ${idValidation.reason || 'ID invalide'}`
              };
            }
            
            const distanceValidation = await validateDistance(idValidation.extractedId!, 'activity', `byFamilyRecommendedPanel[${familyIndex}].orderedRecommendedActivities[${activityIndex}]`);
            if (!distanceValidation.isValid) {
              return {
                isValid: false,
                reason: distanceValidation.reason || `Distance manquante pour byFamilyRecommendedPanel[${familyIndex}].orderedRecommendedActivities[${activityIndex}]`
              };
            }
          }
        }
        
        // Vérifier aroundYouRecommended si présent
        if (family.aroundYouRecommended) {
          const aroundYou = family.aroundYouRecommended;
          
          if (aroundYou.orderedRecommendedPractices && Array.isArray(aroundYou.orderedRecommendedPractices)) {
            for (let practiceIndex = 0; practiceIndex < aroundYou.orderedRecommendedPractices.length; practiceIndex++) {
              const practice = aroundYou.orderedRecommendedPractices[practiceIndex];
              if (!practice || !practice.id) continue;
              
              const idValidation = validateAndExtractId(practice.id, 'practice');
              if (!idValidation.isValid) {
                return {
                  isValid: false,
                  reason: `byFamilyRecommendedPanel[${familyIndex}].aroundYouRecommended.orderedRecommendedPractices[${practiceIndex}] : ${idValidation.reason || 'ID invalide'}`
                };
              }
              
              const distanceValidation = await validateDistance(idValidation.extractedId!, 'practice', `byFamilyRecommendedPanel[${familyIndex}].aroundYouRecommended.orderedRecommendedPractices[${practiceIndex}]`);
              if (!distanceValidation.isValid) {
                return {
                  isValid: false,
                  reason: distanceValidation.reason || `Distance manquante pour byFamilyRecommendedPanel[${familyIndex}].aroundYouRecommended.orderedRecommendedPractices[${practiceIndex}]`
                };
              }
              
              // Vérifier que la distance est bien < 60 km
              const distance = distancesMap.get(idValidation.extractedId!);
              if (distance && distance.distance >= 60) {
                return {
                  isValid: false,
                  reason: `byFamilyRecommendedPanel[${familyIndex}].aroundYouRecommended.orderedRecommendedPractices[${practiceIndex}] : La pratique doit être à moins de 60 km (distance actuelle: ${distance.distance} km)`
                };
              }
            }
          }
          
          if (aroundYou.orderedRecommendedActivities && Array.isArray(aroundYou.orderedRecommendedActivities)) {
            for (let activityIndex = 0; activityIndex < aroundYou.orderedRecommendedActivities.length; activityIndex++) {
              const activity = aroundYou.orderedRecommendedActivities[activityIndex];
              if (!activity || !activity.id) continue;
              
              const idValidation = validateAndExtractId(activity.id, 'activity');
              if (!idValidation.isValid) {
                return {
                  isValid: false,
                  reason: `byFamilyRecommendedPanel[${familyIndex}].aroundYouRecommended.orderedRecommendedActivities[${activityIndex}] : ${idValidation.reason || 'ID invalide'}`
                };
              }
              
              const distanceValidation = await validateDistance(idValidation.extractedId!, 'activity', `byFamilyRecommendedPanel[${familyIndex}].aroundYouRecommended.orderedRecommendedActivities[${activityIndex}]`);
              if (!distanceValidation.isValid) {
                return {
                  isValid: false,
                  reason: distanceValidation.reason || `Distance manquante pour byFamilyRecommendedPanel[${familyIndex}].aroundYouRecommended.orderedRecommendedActivities[${activityIndex}]`
                };
              }
              
              // Vérifier que la distance est bien < 60 km
              const distance = distancesMap.get(idValidation.extractedId!);
              if (distance && distance.distance >= 60) {
                return {
                  isValid: false,
                  reason: `byFamilyRecommendedPanel[${familyIndex}].aroundYouRecommended.orderedRecommendedActivities[${activityIndex}] : L'activité doit être à moins de 60 km (distance actuelle: ${distance.distance} km)`
                };
              }
            }
          }
        }
      }
    }

    // Enrichir la réponse avec les distances depuis globalIntentInfos
    // Les distances sont déjà dans distancesMap, on les ajoute maintenant au summary
    try {
      const responseText = response.response;
      if (responseText && typeof responseText === 'string') {
        let parsedResponse: any;
        try {
          parsedResponse = JSON.parse(responseText);
        } catch {
          // Si ce n'est pas du JSON, retourner la réponse telle quelle
          return {
            isValid: true,
            finalObject: response
          };
        }
        
        // Détecter la structure du summary (même logique qu'au début de la fonction)
        let summaryToEnrich: any = null;
        if (parsedResponse.summary && typeof parsedResponse.summary === 'object') {
          summaryToEnrich = parsedResponse.summary;
        } else if (parsedResponse.recommendation && typeof parsedResponse.recommendation === 'object') {
          summaryToEnrich = parsedResponse;
        }
        
        if (summaryToEnrich && summaryToEnrich.recommendation) {
          const recommendationToEnrich = summaryToEnrich.recommendation;
          
          // Enrichir top1Recommandation avec la distance
          if (recommendationToEnrich.top1Recommandation) {
            const top1 = recommendationToEnrich.top1Recommandation;
            const idValidation = validateAndExtractId(top1.id, top1.type === 'activity' ? 'activity' : 'practice');
            if (idValidation.isValid && idValidation.extractedId) {
              const distance = distancesMap.get(idValidation.extractedId);
              if (distance) {
                top1.distance = distance;
              }
            }
          }
          
          // Enrichir topRecommendedPanel avec les distances
          if (recommendationToEnrich.topRecommendedPanel) {
            const panel = recommendationToEnrich.topRecommendedPanel;
            
            if (panel.orderedTopPractices && Array.isArray(panel.orderedTopPractices)) {
              panel.orderedTopPractices.forEach((practice: any) => {
                if (practice && practice.id) {
                  const idValidation = validateAndExtractId(practice.id, 'practice');
                  if (idValidation.isValid && idValidation.extractedId) {
                    const distance = distancesMap.get(idValidation.extractedId);
                    if (distance) {
                      practice.distance = distance;
                    }
                  }
                }
              });
            }
            
            if (panel.orderedTopActivities && Array.isArray(panel.orderedTopActivities)) {
              panel.orderedTopActivities.forEach((activity: any) => {
                if (activity && activity.id) {
                  const idValidation = validateAndExtractId(activity.id, 'activity');
                  if (idValidation.isValid && idValidation.extractedId) {
                    const distance = distancesMap.get(idValidation.extractedId);
                    if (distance) {
                      activity.distance = distance;
                    }
                  }
                }
              });
            }
          }
          
          // Enrichir byFamilyRecommendedPanel avec les distances (convertir en array si nécessaire)
          if (recommendationToEnrich.byFamilyRecommendedPanel) {
            let byFamilyPanelToEnrich: any[] = [];
            if (Array.isArray(recommendationToEnrich.byFamilyRecommendedPanel)) {
              byFamilyPanelToEnrich = recommendationToEnrich.byFamilyRecommendedPanel;
            } else if (typeof recommendationToEnrich.byFamilyRecommendedPanel === 'object') {
              // Convertir l'objet en array avec familyId comme propriété
              byFamilyPanelToEnrich = Object.entries(recommendationToEnrich.byFamilyRecommendedPanel).map(([familyId, familyData]: [string, any]) => ({
                familyId,
                ...familyData
              }));
              // Mettre à jour pour que le frontend reçoive un array
              recommendationToEnrich.byFamilyRecommendedPanel = byFamilyPanelToEnrich;
            }
            
            byFamilyPanelToEnrich.forEach((family: any) => {
              if (family && family.orderedRecommendedPractices && Array.isArray(family.orderedRecommendedPractices)) {
                family.orderedRecommendedPractices.forEach((practice: any) => {
                  if (practice && practice.id) {
                    const idValidation = validateAndExtractId(practice.id, 'practice');
                    if (idValidation.isValid && idValidation.extractedId) {
                      const distance = distancesMap.get(idValidation.extractedId);
                      if (distance) {
                        practice.distance = distance;
                      }
                    }
                  }
                });
              }
              
              if (family && family.orderedRecommendedActivities && Array.isArray(family.orderedRecommendedActivities)) {
                family.orderedRecommendedActivities.forEach((activity: any) => {
                  if (activity && activity.id) {
                    const idValidation = validateAndExtractId(activity.id, 'activity');
                    if (idValidation.isValid && idValidation.extractedId) {
                      const distance = distancesMap.get(idValidation.extractedId);
                      if (distance) {
                        activity.distance = distance;
                      }
                    }
                  }
                });
              }
              
              // Enrichir aroundYouRecommended avec les distances
              if (family && family.aroundYouRecommended) {
                const aroundYou = family.aroundYouRecommended;
                
                if (aroundYou.orderedRecommendedPractices && Array.isArray(aroundYou.orderedRecommendedPractices)) {
                  aroundYou.orderedRecommendedPractices.forEach((practice: any) => {
                    if (practice && practice.id) {
                      const idValidation = validateAndExtractId(practice.id, 'practice');
                      if (idValidation.isValid && idValidation.extractedId) {
                        const distance = distancesMap.get(idValidation.extractedId);
                        if (distance) {
                          practice.distance = distance;
                        }
                      }
                    }
                  });
                }
                
                if (aroundYou.orderedRecommendedActivities && Array.isArray(aroundYou.orderedRecommendedActivities)) {
                  aroundYou.orderedRecommendedActivities.forEach((activity: any) => {
                    if (activity && activity.id) {
                      const idValidation = validateAndExtractId(activity.id, 'activity');
                      if (idValidation.isValid && idValidation.extractedId) {
                        const distance = distancesMap.get(idValidation.extractedId);
                        if (distance) {
                          activity.distance = distance;
                        }
                      }
                    }
                  });
                }
              }
            });
          }
          
          // Enrichir recommendedCategories avec les distances (si présent)
          if (recommendationToEnrich.recommendedCategories && Array.isArray(recommendationToEnrich.recommendedCategories)) {
            recommendationToEnrich.recommendedCategories.forEach((category: any) => {
              if (category && category.id) {
                const idValidation = validateAndExtractId(category.id, 'practice');
                if (idValidation.isValid && idValidation.extractedId) {
                  const distance = distancesMap.get(idValidation.extractedId);
                  if (distance) {
                    category.distance = distance;
                  }
                }
              }
            });
          }
          
          // Enrichir recommendedActivities avec les distances (si présent)
          if (recommendationToEnrich.recommendedActivities && Array.isArray(recommendationToEnrich.recommendedActivities)) {
            recommendationToEnrich.recommendedActivities.forEach((activity: any) => {
              if (activity && activity.id) {
                const idValidation = validateAndExtractId(activity.id, 'activity');
                if (idValidation.isValid && idValidation.extractedId) {
                  const distance = distancesMap.get(idValidation.extractedId);
                  if (distance) {
                    activity.distance = distance;
                  }
                }
              }
            });
          }
          
          // Reconstruire la réponse avec les distances enrichies
          const enrichedResponse: RecommendationMessageResponse = {
            ...response,
            response: JSON.stringify(parsedResponse)
          };
          
          console.log('✅ [BILAN] Distances enrichies dans le summary');
          
          return {
            isValid: true,
            finalObject: enrichedResponse
          };
        }
      }
    } catch (error) {
      console.warn('⚠️ [BILAN] Erreur lors de l\'enrichissement des distances dans validateSummaryResponse:', error);
    }

    // Toutes les validations sont passées
    return {
      isValid: true,
      finalObject: response
    };
  }

  /**
   * Valide une première réponse IA générée pour le bilan
   * Utilise la même logique que validateResponse mais adaptée pour la première réponse
   * Vérifie que la réponse respecte le format Summary avant de la marquer comme "summary"
   * @param response La première réponse IA à valider
   * @param context Le contexte de la conversation
   * @returns Un objet contenant isValid (boolean), reason (string optionnel) et finalObject (RecommendationMessageResponse optionnel)
   */
  public override async validateFirstResponse(
    response: RecommendationMessageResponse, 
    context: HowanaContext
  ): Promise<{
    isValid: boolean;
    reason?: string;
    finalObject?: RecommendationMessageResponse;
  }> {

    console.log("validateFirstResponse - start");

    // Utiliser validateSummaryResponse pour valider le format, les IDs et les distances
    const summaryValidationResult = await this.validateSummaryResponse(
      response,
      context
    );
    
    // Si la validation du summary a échoué, lancer une erreur
    if (!summaryValidationResult.isValid) {
      const errorMessage = summaryValidationResult.reason || 'La validation du summary a échoué';
      console.error("❌ [BILAN] Invalid summary detected:", errorMessage);
      throw new Error(errorMessage);
    }
    
    // Vérifier que la réponse respecte le format Summary avant de la marquer comme "summary"
    try {
      const responseText = summaryValidationResult.finalObject?.response || response.response;
      
      if (!responseText || typeof responseText !== 'string') {
        return {
          isValid: false,
          reason: 'La réponse ne contient pas de contenu valide pour être un summary'
        };
      }
      
      // Parser le JSON de la réponse
      let parsedResponse: any;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch (parseError) {
        return {
          isValid: false,
          reason: 'La réponse n\'est pas un JSON valide pour être un summary'
        };
      }
      
      // Détecter la structure du summary : peut être directement dans parsedResponse ou dans parsedResponse.summary
      let summary: any = null;
      let recommendation: any = null;
      let userProfile: any = null;
      
      // Cas 1 : Le summary est directement dans parsedResponse (format: { recommendation: ..., userProfile: ... })
      if (parsedResponse.recommendation && typeof parsedResponse.recommendation === 'object') {
        summary = parsedResponse;
        recommendation = parsedResponse.recommendation;
        userProfile = parsedResponse.userProfile;
      }
      // Cas 2 : Le summary est dans parsedResponse.summary (format: { summary: { recommendation: ..., userProfile: ... } })
      else if (parsedResponse.summary && typeof parsedResponse.summary === 'object') {
        summary = parsedResponse.summary;
        // Vérifier si recommendation est directement dans summary ou dans summary.summary
        if (summary.recommendation && typeof summary.recommendation === 'object') {
          recommendation = summary.recommendation;
          userProfile = summary.userProfile;
        } else if (summary.summary?.recommendation && typeof summary.summary.recommendation === 'object') {
          recommendation = summary.summary.recommendation;
          userProfile = summary.summary.userProfile;
          // Reformater pour avoir recommendation et userProfile au niveau supérieur
          summary = {
            ...summary.summary,
            recommendation: recommendation,
            userProfile: userProfile
          };
        }
      }
      
      if (!summary || typeof summary !== 'object') {
        return {
          isValid: false,
          reason: 'La réponse ne contient pas d\'objet "summary" valide'
        };
      }
      
      // Vérifier la présence des 2 champs obligatoires : recommendation et userProfile
      if (!recommendation || typeof recommendation !== 'object') {
        return {
          isValid: false,
          reason: 'Le summary ne contient pas le champ obligatoire "recommendation"'
        };
      }
      
      // Utiliser userProfile détecté ou celui dans summary
      const finalUserProfile = userProfile || summary.userProfile;
      if (!finalUserProfile || typeof finalUserProfile !== 'object') {
        return {
          isValid: false,
          reason: 'Le summary ne contient pas le champ obligatoire "userProfile"'
        };
      }
      
      // Reformater le summary pour s'assurer qu'il a le bon format
      // Format attendu : { summary: { recommendation: ..., userProfile: ... } }
      const formattedSummary = {
        recommendation: recommendation,
        userProfile: finalUserProfile,
        // Préserver les autres champs si présents (importanteKnowledge, univers, etc.)
        ...(summary.importanteKnowledge && { importanteKnowledge: summary.importanteKnowledge }),
        ...(summary.univers && { univers: summary.univers })
      };
      
      // Formater la réponse pour qu'IAController détecte bien un summary
      // IAController vérifie : iaResponse.type === 'summary' || iaResponse.message_type === 'summary'
      // Et attend le format : response: { summary: summary.summary } (en string JSON)
      const finalResponse = summaryValidationResult.finalObject || { ...response };
      
      // S'assurer que response contient bien { summary: ... } en format JSON string
      // RecommendationMessageResponse.response est de type string
      finalResponse.response = JSON.stringify({ summary: formattedSummary });
      
      // Marquer explicitement comme summary pour qu'IAController le détecte
      (finalResponse as any).type = 'summary';
      (finalResponse as any).message_type = 'summary';
      
      return {
        isValid: true,
        finalObject: finalResponse
      };
    } catch (error) {
      return {
        isValid: false,
        reason: `Erreur lors de la validation du format Summary: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      };
    }
  }

}
