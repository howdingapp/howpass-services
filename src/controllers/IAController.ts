import { Request, Response } from 'express';
import { ChatBotServiceFactory } from '../services/ChatBotServiceFactory';
import { BaseChatBotService } from '../services/BaseChatBotService';
import { ConversationService } from '../services/ConversationService';
import { SupabaseService } from '../services/SupabaseService';
import { HowanaContext } from '../types/repositories';
import { IAAuthenticatedRequest } from '../middleware/iaAuthMiddleware';

interface IATaskRequest {
  type: 'generate_response' | 'generate_summary' | 'generate_first_response' | 'generate_unfinished_exchange';
  conversationId: string;
  userId: string;
  userMessage?: string;
  priority?: 'low' | 'medium' | 'high';
  aiResponseId?: string; // ID de l'entrée ai_response pré-créée
  lastAnswer?: string; // Dernière réponse de l'utilisateur pour les échanges non finis
}

export class IAController {
  private conversationService: ConversationService;
  private supabaseService: SupabaseService;

  constructor() {
    this.conversationService = new ConversationService();
    this.supabaseService = new SupabaseService();
  }


  /**
   * Obtenir le service de chatbot approprié selon le type de conversation
   */
  private getChatBotService(context: HowanaContext): BaseChatBotService {
    const service = ChatBotServiceFactory.createService(context);
    console.log(`🤖 Service de chatbot créé: ${service.constructor.name} pour le type: ${context.type}`);
    return service;
  }

  /**
   * Vérifier si l'utilisateur a atteint la limite journalière de messages
   * Cette vérification s'applique uniquement pour les conversations de type 'bilan' ou 'recommandation'
   */
  private async checkDailyMessageLimit(userId: string, conversationType: string): Promise<boolean> {
    // Ne vérifier la limite que pour les conversations de type 'bilan' ou 'recommandation'
    if (conversationType !== 'bilan' && conversationType !== 'recommandation') {
      return false;
    }

    try {
      // Récupérer le profil de l'utilisateur pour déterminer la limite
      const profilResult = await this.supabaseService.getUserProfil(userId);
      if (!profilResult.success) {
        console.warn('⚠️ Impossible de récupérer le profil utilisateur, utilisation de la limite par défaut (non-free)');
      }

      const isFree = profilResult.profil === 'free';
      
      // Déterminer la limite selon le profil
      const maxDailyMessages = isFree 
        ? parseInt(process.env['MAX_DAILY_MESSAGES_FREE'] || '10', 10)
        : parseInt(process.env['MAX_DAILY_MESSAGES'] || '30', 10);

      const result = await this.supabaseService.countTodayValidMessagesByUserId(userId);
      if (!result.success) {
        console.warn('⚠️ Impossible de récupérer le nombre de messages valides du jour, on continue sans limite');
        return false;
      }

      const todayMessagesCount = result.count || 0;
      const hasReachedLimit = todayMessagesCount >= maxDailyMessages;
      
      if (hasReachedLimit) {
        console.log(`⚠️ Limite journalière de messages atteinte: ${todayMessagesCount}/${maxDailyMessages} pour l'utilisateur ${userId} (profil: ${profilResult.profil || 'unknown'})`);
      } else {
        console.log(`📊 Nombre de messages valides aujourd'hui: ${todayMessagesCount}/${maxDailyMessages} pour l'utilisateur ${userId} (profil: ${profilResult.profil || 'unknown'})`);
      }
      
      return hasReachedLimit;
    } catch (error) {
      console.error('❌ Erreur lors de la vérification de la limite journalière de messages:', error);
      return false;
    }
  }

  /**
   * Traiter une tâche IA reçue de Google Cloud Tasks
   */
  async processIATask(req: IAAuthenticatedRequest, res: Response): Promise<void> {
    try {
      console.log('🚀 Tâche IA reçue:', req.body);
      
      // Le token a déjà été validé par le middleware
      const authToken = req.validatedAuthToken;
      
      if (!authToken) {
        console.error('❌ Token d\'authentification manquant après validation');
        res.status(401).json({
          error: 'Token d\'authentification manquant',
          message: 'Le token d\'authentification est requis'
        });
        return;
      }

      const taskData = req.body as IATaskRequest;
      
      // Validation supplémentaire des données
      if (!taskData.type || !taskData.conversationId) {
        console.error('❌ Données de tâche incomplètes:', taskData);
        res.status(400).json({
          error: 'Données de tâche incomplètes',
          message: 'Les champs type, conversationId et userId sont requis'
        });
        return;
      }

      // Vérifier que la conversation existe et récupérer le contexte Howana
      const context = await this.conversationService.getContext(taskData.conversationId);
      if (!context) {
        console.error(`❌ Contexte Howana non trouvé: ${taskData.conversationId}`);
        res.status(404).json({
          error: 'Contexte non trouvé',
          message: `Le contexte de la conversation ${taskData.conversationId} n'existe pas`
        });
        return;
      }

      // Valider le type de conversation
      if (!ChatBotServiceFactory.isSupportedType(context.type)) {
        console.error(`❌ Type de conversation non supporté: ${context.type}`);
        res.status(400).json({
          error: 'Type de conversation non supporté',
          message: `Le type '${context.type}' n'est pas supporté. Types supportés: ${ChatBotServiceFactory.getSupportedTypes().join(', ')}`
        });
        return;
      }

      console.log(`🎯 Traitement de la tâche IA: ${taskData.type} pour ${taskData.conversationId}`);
      console.log(`🏷️ Type de conversation: ${context.type}`);

      console.log('🔍 Contexte de la conversation:', context);

      // Vérifier la limite journalière de messages pour les tâches de type generate_response
      // Si la limite est atteinte, forcer la génération d'un résumé
      // Cette vérification s'applique uniquement pour les conversations de type 'bilan' ou 'recommandation'
      if (taskData.type === 'generate_response') {
        const hasReachedDailyLimit = await this.checkDailyMessageLimit(taskData.userId, context.type);
        if (hasReachedDailyLimit) {
          console.log(`🔄 Limite journalière de messages atteinte, conversion de generate_response en generate_summary`);
          taskData.type = 'generate_summary';
        }
      }

      // Mesurer le temps de traitement
      const startTime = Date.now();

      // Traiter selon le type de tâche
      let result: { updatedContext: HowanaContext; iaResponse: any };
      
      switch (taskData.type) {
        case 'generate_response':
          result = await this.processGenerateResponse(taskData, context);
          break;
        case 'generate_summary':
          result = await this.processGenerateSummary(taskData, context);
          break;
        case 'generate_first_response':
          result = await this.processGenerateFirstResponse(taskData, context);
          break;
        case 'generate_unfinished_exchange':
          result = await this.processGenerateUnfinishedExchange(taskData, context);
          break;
        default:
          console.error('❌ Type de tâche non reconnu:', taskData.type);
          res.status(400).json({
            error: 'Type de tâche non reconnu',
            message: `Le type '${taskData.type}' n'est pas supporté`
          });
          return;
      }

      // Obtenir le service de chatbot pour onTaskFinish
      const chatBotService = this.getChatBotService(result.updatedContext);

      // Calculer le temps de traitement en secondes
      const endTime = Date.now();
      const processingTimeSeconds = (endTime - startTime) / 1000;

      // Finaliser la tâche avec la mise à jour de la base de données
      await this.finalizeTask(taskData, result.updatedContext, result.iaResponse, chatBotService, processingTimeSeconds);

      console.log(`✅ Tâche IA traitée avec succès: ${taskData.type}`);
      res.status(200).json({
        success: true,
        message: `Tâche ${taskData.type} traitée avec succès`,
        conversationId: taskData.conversationId,
        type: taskData.type
      });

    } catch (error) {
      console.error('❌ Erreur lors du traitement de la tâche IA:', error);
      res.status(500).json({
        error: 'Erreur interne',
        message: 'Une erreur est survenue lors du traitement de la tâche IA'
      });
    }
  }

  /**
   * Fonction centralisée pour finaliser une tâche IA
   * Met à jour le contexte et la réponse IA en une seule opération
   */
  private async finalizeTask(
    taskData: IATaskRequest, 
    updatedContext: HowanaContext, 
    iaResponse: any, 
    chatBotService: BaseChatBotService,
    processingTimeSeconds: number
  ): Promise<void> {
    try {
      console.log(`🔄 Finalisation de la tâche ${taskData.type} pour ${taskData.conversationId}`);

      // Mettre à jour le contexte en base de données
      const contextUpdateResult = await this.supabaseService.updateContext(taskData.conversationId, updatedContext);
      if (!contextUpdateResult.success) {
        console.error('❌ Erreur lors de la mise à jour du contexte:', contextUpdateResult.error);
        throw new Error(`Erreur lors de la mise à jour du contexte: ${contextUpdateResult.error}`);
      }
      console.log('✅ Contexte mis à jour en base de données');

      // 1. Récupérer l'ID de la réponse (soit celui de la tâche, soit celui du contexte)
      // finalizeTask ne crée jamais, elle utilise uniquement l'ID existant
      let aiResponseId: string | undefined = taskData.aiResponseId;
      
      // Si pas d'ID dans la tâche, essayer de le récupérer depuis le contexte
      if (!aiResponseId && updatedContext.metadata?.['lastIntermediateAiResponseId']) {
        aiResponseId = updatedContext.metadata['lastIntermediateAiResponseId'] as string;
      }
      
      if (!aiResponseId) {
        throw new Error('❌ Aucun aiResponseId disponible (ni dans taskData, ni dans le contexte)');
      }

      // 2. Extraire le nombre de tokens depuis iaResponse et ajouter le coût de l'intent
      const responseTokens = iaResponse.cost !== undefined && iaResponse.cost !== null ? iaResponse.cost : 0;
      const intentCost = (updatedContext.metadata?.['currentIntentInfos'] as any)?.intentCost as number | undefined ?? 0;
      const tokens = responseTokens + intentCost; // Coût total = réponse + intent

      // 3. Faire un appel de mise à jour globale
      const updateResult = await this.supabaseService.updateAIResponse(aiResponseId, {
        response_text: JSON.stringify(iaResponse),
        next_response_id: null, // Dernière réponse, pas de suivant
        cost: tokens, // Nombre de tokens utilisés
        user_input_text: taskData.userMessage || null, // Message utilisateur qui a déclenché cette réponse
        metadata: {
          source: 'ai',
          model: chatBotService.getAIModel(),
          type: taskData.type,
          messageId: iaResponse.messageId,
          status: 'completed',
          recommendations: iaResponse.recommendations || updatedContext.recommendations || { activities: [], practices: [] },
          hasRecommendations: iaResponse.hasRecommendations || ((updatedContext.recommendations?.activities?.length || 0) > 0 || (updatedContext.recommendations?.practices?.length || 0) > 0),
          recommendationRequiredForSummary: chatBotService['recommendationRequiredForSummary'](updatedContext)
        }
      });

      if (!updateResult.success) {
        console.error('❌ Erreur lors de la mise à jour de la réponse IA:', updateResult.error);
        throw new Error(`Erreur lors de la mise à jour de la réponse IA: ${updateResult.error}`);
      }

      // 4. Mettre à jour le total_cost de la conversation si des tokens ont été utilisés
      if (tokens !== null && tokens > 0) {
        const totalCostUpdateResult = await this.supabaseService.updateConversationTotalCost(taskData.conversationId, tokens);
        if (!totalCostUpdateResult.success) {
          console.error('❌ Erreur lors de la mise à jour du total_cost:', totalCostUpdateResult.error);
          // Ne pas faire échouer la requête si la mise à jour du total_cost échoue
        }
      }

      // 5. Mettre à jour le compute_time de la conversation
      const computeTimeUpdateResult = await this.supabaseService.updateConversationComputeTime(
        taskData.conversationId,
        processingTimeSeconds
      );
      if (!computeTimeUpdateResult.success) {
        console.error('❌ Erreur lors de la mise à jour du compute_time:', computeTimeUpdateResult.error);
        // Ne pas faire échouer la requête si la mise à jour du compute_time échoue
      } else {
        console.log(`✅ Compute_time mis à jour: +${processingTimeSeconds}s`);
      }

      // 6. Marquer la conversation comme terminée si c'est un résumé ou un échange non fini
      if (taskData.type === 'generate_summary' || taskData.type === 'generate_unfinished_exchange') {
        const statusUpdateResult = await this.supabaseService.updateConversationStatus(taskData.conversationId, 'completed');
        if (!statusUpdateResult.success) {
          console.error('❌ Erreur lors de la mise à jour du status de la conversation:', statusUpdateResult.error);
          // Ne pas faire échouer la requête si la mise à jour du status échoue
        } else {
          console.log(`✅ Conversation ${taskData.conversationId} marquée comme terminée`);
        }
      }
      
      console.log(`✅ aiResponse mise à jour: ${aiResponseId}`);

      console.log(`✅ Tâche ${taskData.type} finalisée avec succès`);
    } catch (error) {
      console.error(`❌ Erreur lors de la finalisation de la tâche ${taskData.type}:`, error);
      throw error;
    }
  }

  /**
   * Fonction pour finaliser une réponse IA intermédiaire (avec next_response_id)
   * Met à jour le contexte et crée/met à jour l'entrée ai_response
   * Ne doit être appelée que pour les réponses intermédiaires
   */
  private async finalizeIntermediateResponse(
    taskData: IATaskRequest,
    iaResponse: any,
    updatedContext: HowanaContext,
    chatBotService: BaseChatBotService,
    isFirstResponse: boolean
  ): Promise<string> {
    try {
      console.log(`🔄 Finalisation de la réponse IA intermédiaire (première: ${isFirstResponse})`);

      // 1. Récupérer la dernière réponse en cours de construction
      // Soit lastIntermediateAiResponseId du contexte, soit taskData.aiResponseId
      let aiResponseId: string | undefined = updatedContext.metadata?.['lastIntermediateAiResponseId'] as string | undefined;
      if (!aiResponseId) {
        aiResponseId = taskData.aiResponseId;
      }

      // On doit toujours avoir un aiResponseId à ce stade
      if (!aiResponseId) {
        throw new Error('❌ Aucun aiResponseId disponible (ni dans lastIntermediateAiResponseId du contexte, ni dans taskData.aiResponseId)');
      }

      // 2. Détecter s'il y aura une réponse suivante
      const hasNext = iaResponse.haveNext === true;
      
      let nextResponseId: string | null = null;
      let newIntermediateResponseId: string | undefined = undefined;

      // 3. Si on détecte qu'il y aura un next, créer une nouvelle réponse intermédiaire
      if (hasNext) {
        const createNextResult = await this.supabaseService.createAIResponse({
          conversation_id: taskData.conversationId,
          user_id: taskData.userId,
          response_text: null, // Réponse vide pour l'instant
          message_type: 'text',
          next_response_id: null
        } as any);

        if (!createNextResult.success) {
          console.error('❌ Erreur lors de la création de la prochaine réponse IA:', createNextResult.error);
          throw new Error(`Erreur lors de la création de la prochaine réponse IA: ${createNextResult.error}`);
        }

        if (!createNextResult.data?.id) {
          throw new Error('❌ ID non retourné après création de la prochaine réponse IA');
        }

        newIntermediateResponseId = createNextResult.data.id;
        nextResponseId = newIntermediateResponseId;
        console.log(`✅ Prochaine réponse intermédiaire créée: ${newIntermediateResponseId}`);

        // Mettre à jour le contexte avec le nouvel ID
        updatedContext.metadata = {
          ...updatedContext.metadata,
          ['lastIntermediateAiResponseId']: newIntermediateResponseId
        };
      }

      // 4. Extraire le nombre de tokens depuis iaResponse et ajouter le coût de l'intent (seulement pour la première réponse)
      const responseTokens = iaResponse.cost !== undefined && iaResponse.cost !== null ? iaResponse.cost : 0;
      const intentCost = isFirstResponse ? ((updatedContext.metadata?.['currentIntentInfos'] as any)?.intentCost as number | undefined ?? 0) : 0;
      const tokens = responseTokens + intentCost; // Coût total = réponse + intent (intent seulement pour la première réponse)

      // 5. Mettre à jour les informations de la réponse actuelle
      const updateResult = await this.supabaseService.updateAIResponse(aiResponseId, {
        response_text: JSON.stringify(iaResponse),
        next_response_id: nextResponseId,
        cost: tokens, // Nombre de tokens utilisés
        user_input_text: taskData.userMessage || null, // Message utilisateur qui a déclenché cette réponse
        metadata: {
          source: 'ai',
          model: chatBotService.getAIModel(),
          type: isFirstResponse ? taskData.type : 'generate_response',
          messageId: iaResponse.messageId,
          status: 'completed',
          recommendations: iaResponse.recommendations || updatedContext.recommendations || { activities: [], practices: [] },
          hasRecommendations: iaResponse.hasRecommendations || ((updatedContext.recommendations?.activities?.length || 0) > 0 || (updatedContext.recommendations?.practices?.length || 0) > 0),
          recommendationRequiredForSummary: chatBotService['recommendationRequiredForSummary'](updatedContext)
        }
      });

      if (!updateResult.success) {
        console.error('❌ Erreur lors de la mise à jour de la réponse IA:', updateResult.error);
        throw new Error(`Erreur lors de la mise à jour de la réponse IA: ${updateResult.error}`);
      }

      // 6. Mettre à jour le total_cost de la conversation si des tokens ont été utilisés
      if (tokens !== null && tokens > 0) {
        const totalCostUpdateResult = await this.supabaseService.updateConversationTotalCost(taskData.conversationId, tokens);
        if (!totalCostUpdateResult.success) {
          console.error('❌ Erreur lors de la mise à jour du total_cost:', totalCostUpdateResult.error);
          // Ne pas faire échouer la requête si la mise à jour du total_cost échoue
        }
      }

      // 7. Mettre à jour le contexte en base de données
      const contextUpdateResult = await this.supabaseService.updateContext(taskData.conversationId, updatedContext);
      if (!contextUpdateResult.success) {
        console.error('❌ Erreur lors de la mise à jour du contexte:', contextUpdateResult.error);
        throw new Error(`Erreur lors de la mise à jour du contexte: ${contextUpdateResult.error}`);
      }
      console.log('✅ Contexte mis à jour en base de données');
      
      console.log(`✅ aiResponse mise à jour: ${aiResponseId}${hasNext ? `, prochaine réponse préparée: ${newIntermediateResponseId}` : ''}`);
      
      // Retourner l'ID de cette réponse pour la chaîne suivante
      return aiResponseId;
    } catch (error) {
      console.error('❌ Erreur lors de la finalisation de la réponse IA intermédiaire:', error);
      throw error;
    }
  }

  /**
   * Traiter la génération d'une première réponse IA
   */
  private async processGenerateFirstResponse(taskData: IATaskRequest, context: HowanaContext): Promise<{ updatedContext: HowanaContext; iaResponse: any }> {
    console.log(`👋 Génération d'une première réponse IA pour: ${taskData.conversationId}`);
    
    // Obtenir le service de chatbot approprié
    const chatBotService = this.getChatBotService(context);
    
    const firstResponseResult = await chatBotService.generateFirstResponse(context);
    
    // Mettre à jour le contexte avec les nouvelles informations
    const updatedContext = { ...context };
    updatedContext.previousCallId = firstResponseResult.messageId;
    updatedContext.previousResponse = firstResponseResult.response;

    // Créer l'objet de réponse IA
    const iaResponse = {
      ...firstResponseResult,
      messageId: firstResponseResult.messageId || `msg_${Date.now()}`,
      type: 'first_response',
      recommendations: context.recommendations || { activities: [], practices: [] },
      hasRecommendations: context.hasRecommendations || false
    };

    console.log(`📋 Recommandations requises pour le résumé: ${chatBotService['recommendationRequiredForSummary'](context)}`);

    return {
      updatedContext,
      iaResponse
    };
  }
  
  /**
   * Traiter la génération d'une réponse IA
   */
  private async processGenerateResponse(taskData: IATaskRequest, context: HowanaContext): Promise<{ updatedContext: HowanaContext; iaResponse: any }> {
    if (!taskData.userMessage) {
      throw new Error('Message utilisateur manquant pour la génération de réponse');
    }

    console.log(`🤖 Génération d'une réponse IA pour: ${taskData.conversationId}`);
    
    // Obtenir le service de chatbot approprié
    const chatBotService = this.getChatBotService(context);
    
    // Calculer l'intent avant de générer la réponse
    console.log('🎯 Calcul de l\'intent avant génération de la réponse...');
    const intentResult = await chatBotService.computeIntent(context, taskData.userMessage);
    const intent = intentResult.intent;
    const intentCost = intentResult.intentCost;
    const globalIntentInfos = intentResult.globalIntentInfos;
    
    // Mettre à jour le contexte avec l'intent
    let contextWithIntent = { ...context };
    let lastUpdatedContext = contextWithIntent;
    
    // Mettre les nouvelles valeurs dans currentIntentInfos
    const currentIntentInfos = {
      intent: intent || null,
      intentCost: intentCost || null,
      intentContextText: null
    };
    
    contextWithIntent.metadata = {
      ...contextWithIntent.metadata,
      ['currentIntentInfos']: currentIntentInfos,
      ['globalIntentInfos']: globalIntentInfos,
      ['intentResults']: null
    };
    
    if (intent) {
      console.log('✅ Intent calculé avec succès et ajouté au contexte');
    } else {
      console.warn('⚠️ Calcul d\'intent retourné null, génération de la réponse sans intent');
    }
    
    // Créer le callback pour traiter chaque réponse générée par handleIntent
    let responseCount = 0;
    let lastIaResponse: any = null;
    const onIaResponse = async (iaResponse: any): Promise<void> => {
      responseCount++;
      console.log(`📨 handleIntent a généré une réponse #${responseCount}, traitement...`);
      
      // Utiliser la réponse de handleIntent
      const updatedContext = iaResponse.updatedContext || lastUpdatedContext;
      
      // Mettre à jour le contexte avec le nouveau messageId pour les futures réponses
      updatedContext.previousCallId = iaResponse.messageId;
      updatedContext.previousResponse = iaResponse.response;
      
      // Récupérer les extractedData depuis la réponse IA
      const extractedData = iaResponse.extractedData;
      
      // Construire les recommandations à partir des extractedData
      const recommendations = extractedData ? {
        activities: extractedData.activities || [],
        practices: extractedData.practices || []
      } : (lastUpdatedContext.recommendations || { activities: [], practices: [] });

      // Créer l'objet de réponse IA complet
      const completeIaResponse = {
        ...iaResponse,
        messageId: iaResponse.messageId,
        recommendations: recommendations,
        hasRecommendations: (recommendations.activities.length > 0 || recommendations.practices.length > 0)
      };

      console.log(`📋 Recommandations extraites: ${recommendations.activities.length} activités, ${recommendations.practices.length} pratiques`);

      // Vérifier si handleIntent indique qu'il y a une réponse suivante
      const hasNextResponse = iaResponse.haveNext === true;
      
      if (hasNextResponse) {
        // C'est une réponse intermédiaire, finaliser immédiatement
        const isFirstResponse = responseCount === 1;
        await this.finalizeIntermediateResponse(
          taskData,
          completeIaResponse,
          updatedContext,
          chatBotService,
          isFirstResponse
        );
        // Mettre à jour lastUpdatedContext avec le contexte modifié (qui contient lastIntermediateAiResponseId)
        lastUpdatedContext = updatedContext;
      } else {
        // C'est la dernière réponse, on la sauvegarde pour la retourner
        lastIaResponse = completeIaResponse;
      }

      // Mettre à jour le contexte local pour les prochaines réponses
      lastUpdatedContext = updatedContext;
    };

    // Appeler handleIntent avec le callback et attendre qu'il se termine
    // intent et globalIntentInfos sont maintenant récupérés depuis le contexte
    // handleIntent retourne le contexte mis à jour avec le globalIntentInfos calculé
    const updatedContext = await chatBotService['handleIntent'](contextWithIntent, taskData.userMessage, onIaResponse);
    contextWithIntent = updatedContext;
    
    // handleIntent a déjà généré et traité les réponses via le callback
    // Si c'était la dernière réponse (sans have_next), on la retourne et on laisse finalizeTask s'en occuper
    if (lastIaResponse) {
      return {
        updatedContext: contextWithIntent,
        iaResponse: lastIaResponse
      };
    }
    
    // Si aucune réponse n'a été générée (cas théorique), retourner un objet vide
    return {
      updatedContext: contextWithIntent,
      iaResponse: {}
    };
  }

  /**
   * Traiter la génération d'un résumé IA
   */
  private async processGenerateSummary(taskData: IATaskRequest, context: HowanaContext): Promise<{ updatedContext: HowanaContext; iaResponse: any }> {
    console.log(`📝 Génération d'un résumé IA pour: ${taskData.conversationId}`);
    
    // Obtenir le service de chatbot approprié
    const chatBotService = this.getChatBotService(context);
    
    const summary = await chatBotService.generateConversationSummary(context);
    
    // Récupérer les extractedData depuis la réponse du résumé si disponible
    const extractedData = summary.extractedData;
    
    // Construire les recommandations à partir des extractedData
    const recommendations = extractedData ? {
      activities: extractedData.activities || [],
      practices: extractedData.practices || []
    } : (context.recommendations || { activities: [], practices: [] });

    // Créer l'objet de réponse IA pour le résumé
    const iaResponse = {
      response: { summary: summary.summary },
      target_table: context.type === 'bilan' ? 'bilans' : context.type === 'activity' ? 'activities' : 'ai_responses',
      target_id: context.bilanId || context.activityId || null,
      summary_type: 'conversation_summary',
      recommendations: recommendations,
      hasRecommendations: (recommendations.activities.length > 0 || recommendations.practices.length > 0),
      messageId: `summary_${Date.now()}`,
      type: 'summary',
      cost: summary.cost ?? null, // Coût total cumulé (inclut recommandations + résumé)
    };

    return {
      updatedContext: context,
      iaResponse
    };
  }

  /**
   * Traiter la génération d'un échange non fini
   */
  private async processGenerateUnfinishedExchange(taskData: IATaskRequest, context: HowanaContext): Promise<{ updatedContext: HowanaContext; iaResponse: any }> {
    console.log(`🔄 Génération d'un échange non fini pour: ${taskData.conversationId}`);
    
    // Créer un message simple indiquant que l'utilisateur est parti
    const lastAnswer = taskData.lastAnswer || 'L\'utilisateur a quitté la conversation';
    const unfinishedMessage = `L'utilisateur est parti voir d'autre chose, mais voici sa dernière action : "${lastAnswer}". Cette conversation a été interrompue et peut être reprise plus tard.`;
    
    // Créer l'objet de réponse IA
    const iaResponse = {
      response: unfinishedMessage,
      messageId: `unfinished_${Date.now()}`,
      type: 'unfinished_exchange',
      lastUserAction: lastAnswer,
      timestamp: new Date().toISOString(),
      conversationInterrupted: true
    };

    return {
      updatedContext: context,
      iaResponse
    };
  }

  /**
   * Endpoint de santé pour Google Cloud Tasks
   */
  healthCheck(_req: Request, res: Response): void {
    res.status(200).json({
      status: 'healthy',
      service: 'ia-processing',
      timestamp: new Date().toISOString(),
      message: 'Service de traitement IA opérationnel'
    });
  }

  /**
   * Fermer les connexions
   */
  async disconnect(): Promise<void> {
    // Fermer les connexions aux services si nécessaire
    console.log('🔌 Connexions fermées pour IAController');
  }
}
