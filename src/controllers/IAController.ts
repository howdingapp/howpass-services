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
      if (!taskData.type || !taskData.conversationId || !taskData.userId) {
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

      // Finaliser la tâche avec la mise à jour de la base de données
      await this.finalizeTask(taskData, result.updatedContext, result.iaResponse, chatBotService);

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
    chatBotService: BaseChatBotService
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

      // Mettre à jour l'entrée ai_response si un ID est fourni
      if (taskData.aiResponseId) {
        const updateResult = await this.supabaseService.updateAIResponse(taskData.aiResponseId, {
          response_text: JSON.stringify(iaResponse),
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
        console.log(`✅ aiResponse mise à jour: ${taskData.aiResponseId}`);
      } else {
        console.warn(`⚠️ Aucun aiResponseId fourni pour la tâche: ${taskData.type}`);
      }

      console.log(`✅ Tâche ${taskData.type} finalisée avec succès`);
    } catch (error) {
      console.error(`❌ Erreur lors de la finalisation de la tâche ${taskData.type}:`, error);
      throw error;
    }
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
    
    // Générer la réponse IA
    const aiResponse = await chatBotService['generateAIResponse'](context, taskData.userMessage);
    const updatedContext = aiResponse.updatedContext;
    
    // Utiliser le messageId d'OpenAI si disponible, sinon créer un messageId local
    const messageId = aiResponse.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Mettre à jour le contexte avec le nouveau messageId pour les futures réponses
    updatedContext.previousCallId = messageId;
    updatedContext.previousResponse = aiResponse.response;
    
    // Récupérer les extractedData depuis la réponse IA
    const extractedData = aiResponse.extractedData;
    
    // Construire les recommandations à partir des extractedData
    const recommendations = extractedData ? {
      activities: extractedData.activities || [],
      practices: extractedData.practices || []
    } : (context.recommendations || { activities: [], practices: [] });

    // Créer l'objet de réponse IA
    const iaResponse = {
      ...aiResponse,
      messageId: messageId,
      recommendations: recommendations,
      hasRecommendations: (recommendations.activities.length > 0 || recommendations.practices.length > 0)
    };

    console.log(`📋 Recommandations extraites: ${recommendations.activities.length} activités, ${recommendations.practices.length} pratiques`);
    console.log(`📋 Recommandations requises pour le résumé: ${chatBotService['recommendationRequiredForSummary'](context)}`);

    return {
      updatedContext,
      iaResponse
    };
  }

  /**
   * Traiter la génération d'un résumé IA
   */
  private async processGenerateSummary(taskData: IATaskRequest, context: HowanaContext): Promise<{ updatedContext: HowanaContext; iaResponse: any }> {
    console.log(`📝 Génération d'un résumé IA pour: ${taskData.conversationId}`);
    
    // Obtenir le service de chatbot approprié
    const chatBotService = this.getChatBotService(context);
    
    const summary = await chatBotService['generateConversationSummary'](context);
    
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
      type: 'summary'
    };

    return {
      updatedContext: context,
      iaResponse
    };
  }

  /**
   * Traiter la génération d'une première réponse IA
   */
  private async processGenerateFirstResponse(taskData: IATaskRequest, context: HowanaContext): Promise<{ updatedContext: HowanaContext; iaResponse: any }> {
    console.log(`👋 Génération d'une première réponse IA pour: ${taskData.conversationId}`);
    
    // Obtenir le service de chatbot approprié
    const chatBotService = this.getChatBotService(context);
    
    const firstResponseResult = await chatBotService['generateFirstResponse'](context);
    
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
