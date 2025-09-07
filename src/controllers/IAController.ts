import { Request, Response } from 'express';
import { ChatBotServiceFactory } from '../services/ChatBotServiceFactory';
import { BaseChatBotService } from '../services/BaseChatBotService';
import { ConversationService } from '../services/ConversationService';
import { SupabaseService } from '../services/SupabaseService';
import { ConversationContext } from '../types/conversation';
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
  private getChatBotService(context: ConversationContext): BaseChatBotService {
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

      // Vérifier que la conversation existe et est active
      const context = await this.conversationService.getContext(taskData.conversationId);
      if (!context) {
        console.error(`❌ Conversation non trouvée: ${taskData.conversationId}`);
        res.status(404).json({
          error: 'Conversation non trouvée',
          message: `La conversation ${taskData.conversationId} n'existe pas`
        });
        return;
      }

      if (context.status !== 'active') {
        console.error(`❌ Conversation non active: ${taskData.conversationId}`);
        res.status(400).json({
          error: 'Conversation non active',
          message: `La conversation ${taskData.conversationId} n'est plus active`
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
      switch (taskData.type) {
        case 'generate_response':
          await this.processGenerateResponse(taskData, context);
          break;
        case 'generate_summary':
          await this.processGenerateSummary(taskData, context);
          break;
        case 'generate_first_response':
          await this.processGenerateFirstResponse(taskData, context);
          break;
        case 'generate_unfinished_exchange':
          await this.processGenerateUnfinishedExchange(taskData, context);
          break;
        default:
          console.error('❌ Type de tâche non reconnu:', taskData.type);
          res.status(400).json({
            error: 'Type de tâche non reconnu',
            message: `Le type '${taskData.type}' n'est pas supporté`
          });
          return;
      }

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
   * Traiter la génération d'une réponse IA
   */
  private async processGenerateResponse(taskData: IATaskRequest, context: ConversationContext): Promise<any> {
    if (!taskData.userMessage) {
      throw new Error('Message utilisateur manquant pour la génération de réponse');
    }

    console.log(`🤖 Génération d'une réponse IA pour: ${taskData.conversationId}`);
    
    // Obtenir le service de chatbot approprié
    const chatBotService = this.getChatBotService(context);
    
    // Générer la réponse IA
    const aiResponse = await chatBotService['generateAIResponse'](context, taskData.userMessage);
    
    // Utiliser le messageId d'OpenAI si disponible, sinon créer un messageId local
    const messageId = aiResponse.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Mettre à jour le contexte avec le nouveau messageId pour les futures réponses
    context.metadata = { ...context.metadata, previousCallId: messageId, previousResponse: aiResponse.response };
    
    // Ajouter la réponse à la conversation (cela met à jour automatiquement le contexte dans Redis)
    await this.conversationService.addMessage(taskData.conversationId, {
      content: JSON.stringify(aiResponse.response),
      type: 'bot',
      metadata: { source: 'ai', model: chatBotService.getAIModel(), messageId: messageId }
    }, context);

    // Mettre à jour l'entrée ai_response pré-créée
    if (taskData.aiResponseId) {
      // Récupérer les extractedData depuis la réponse IA
      const extractedData = aiResponse.extractedData;
      
      // Construire les recommandations à partir des extractedData
      const recommendations = extractedData ? {
        activities: extractedData.activities || [],
        practices: extractedData.practices || []
      } : (context.metadata?.['recommendations'] || { activities: [], practices: [] });

      await this.supabaseService.updateAIResponse(taskData.aiResponseId, {
        response_text: JSON.stringify(aiResponse),
        metadata: { 
          source: 'ai', 
          model: chatBotService.getAIModel(),
          messageId: messageId,
          status: 'completed',
          recommendations: recommendations,
          hasRecommendations: (recommendations.activities.length > 0 || recommendations.practices.length > 0),
          recommendationRequiredForSummary: chatBotService['recommendationRequiredForSummary'](context)
        }
      });
      console.log(`✅ aiResponse mise à jour pour la réponse: ${taskData.aiResponseId}`);
      console.log(`📋 Recommandations extraites: ${recommendations.activities.length} activités, ${recommendations.practices.length} pratiques`);
      console.log(`📋 Recommandations requises pour le résumé: ${chatBotService['recommendationRequiredForSummary'](context)}`);
    } else {
      console.warn(`⚠️ Aucun aiResponseId fourni pour la réponse de la conversation: ${taskData.conversationId}`);
    }

    return {
      success: true,
      response: aiResponse.response,
      messageId: messageId,
      workerId: 'google-cloud-tasks'
    };
  }

  /**
   * Traiter la génération d'un résumé IA
   */
  private async processGenerateSummary(taskData: IATaskRequest, context: ConversationContext): Promise<any> {
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
    } : (context.metadata?.['recommendations'] || { activities: [], practices: [] });

    // Mettre à jour l'entrée ai_response pré-créée pour notifier le frontend
    if (taskData.aiResponseId) {
      try {
        // Créer un objet avec le résumé et les métadonnées
        const responseData = {
          response: { summary: summary.summary },
          target_table: context.type === 'bilan' ? 'bilans' : context.type === 'activity' ? 'activities' : 'ai_responses',
          target_id: context.metadata?.['bilanId'] || context.metadata?.['activityId'] || null,
          summary_type: 'conversation_summary',
          recommendations: recommendations,
          hasRecommendations: (recommendations.activities.length > 0 || recommendations.practices.length > 0)
        };

        await this.supabaseService.updateAIResponse(taskData.aiResponseId, {
          response_text: JSON.stringify(responseData),
          metadata: { 
            source: 'ai', 
            model: chatBotService.getAIModel(), 
            type: 'summary',
            status: 'completed'
          }
        });
        console.log(`✅ aiResponse mise à jour pour notifier le frontend du résumé disponible: ${taskData.aiResponseId}`);
      } catch (error) {
        console.error(`❌ Erreur lors de la mise à jour de l'aiResponse:`, error);
        // Cette erreur est critique car le frontend ne sera pas notifié
        throw error;
      }
    } else {
      console.warn(`⚠️ Aucun aiResponseId fourni pour le résumé de la conversation: ${taskData.conversationId}`);
    }
    
    return {
      success: true,
      summary: summary,
      workerId: 'google-cloud-tasks'
    };
  }

  /**
   * Traiter la génération d'une première réponse IA
   */
  private async processGenerateFirstResponse(taskData: IATaskRequest, context: ConversationContext): Promise<any> {
    console.log(`👋 Génération d'une première réponse IA pour: ${taskData.conversationId}`);
    
    // Obtenir le service de chatbot approprié
    const chatBotService = this.getChatBotService(context);
    
    const firstResponseResult = await chatBotService['generateFirstResponse'](context);
    
    context.metadata = { ...context.metadata, previousCallId: firstResponseResult.messageId, previousResponse: firstResponseResult.response };

    // Ajouter la réponse à la conversation
    await this.conversationService.addMessage(taskData.conversationId, {
      content: JSON.stringify(firstResponseResult),
      type: 'bot',
      metadata: { source: 'ai', model: chatBotService.getAIModel(), type: 'first_response', messageId: firstResponseResult.messageId }
    }, context);

    // Mettre à jour l'entrée ai_response pré-créée
    if (taskData.aiResponseId) {
      await this.supabaseService.updateAIResponse(taskData.aiResponseId, {
        response_text: JSON.stringify(firstResponseResult),
        metadata: { 
          source: 'ai', 
          model: chatBotService.getAIModel(), 
          type: 'first_response', 
          messageId: firstResponseResult.messageId,
          status: 'completed',
          recommendations: context.metadata?.['recommendations'] || { activities: [], practices: [] },
          hasRecommendations: context.metadata?.['hasRecommendations'] || false,
          recommendationRequiredForSummary: chatBotService['recommendationRequiredForSummary'](context)
        }
      });
      console.log(`✅ aiResponse mise à jour pour la première réponse: ${taskData.aiResponseId}`);
      console.log(`📋 Recommandations requises pour le résumé: ${chatBotService['recommendationRequiredForSummary'](context)}`);
    } else {
      console.warn(`⚠️ Aucun aiResponseId fourni pour la première réponse de la conversation: ${taskData.conversationId}`);
    }

    return {
      success: true,
      response: firstResponseResult.response,
      messageId: firstResponseResult.messageId || `msg_${Date.now()}`,
      workerId: 'google-cloud-tasks'
    };
  }



  /**
   * Traiter la génération d'un échange non fini
   */
  private async processGenerateUnfinishedExchange(taskData: IATaskRequest, context: ConversationContext): Promise<any> {
    console.log(`🔄 Génération d'un échange non fini pour: ${taskData.conversationId}`);
    
    // Obtenir le service de chatbot approprié
    const chatBotService = this.getChatBotService(context);
    
    // Créer un message simple indiquant que l'utilisateur est parti
    const lastAnswer = taskData.lastAnswer || 'L\'utilisateur a quitté la conversation';
    const unfinishedMessage = `L'utilisateur est parti voir d'autre chose, mais voici sa dernière action : "${lastAnswer}". Cette conversation a été interrompue et peut être reprise plus tard.`;
    
    // Créer un objet de réponse simple
    const unfinishedResponse = {
      response: unfinishedMessage,
      messageId: `unfinished_${Date.now()}`,
      type: 'unfinished_exchange',
      lastUserAction: lastAnswer,
      timestamp: new Date().toISOString()
    };

    // Ajouter le message à la conversation
    await this.conversationService.addMessage(taskData.conversationId, {
      content: JSON.stringify(unfinishedResponse),
      type: 'bot',
      metadata: { 
        source: 'ai', 
        model: chatBotService.getAIModel(), 
        type: 'unfinished_exchange', 
        messageId: unfinishedResponse.messageId,
        lastUserAction: lastAnswer
      }
    }, context);

    // Mettre à jour l'entrée ai_response pré-créée
    if (taskData.aiResponseId) {
      await this.supabaseService.updateAIResponse(taskData.aiResponseId, {
        response_text: unfinishedMessage,
        metadata: { 
          source: 'ai', 
          model: chatBotService.getAIModel(), 
          type: 'unfinished_exchange', 
          messageId: unfinishedResponse.messageId,
          status: 'completed',
          lastUserAction: lastAnswer,
          conversationInterrupted: true
        }
      });
      console.log(`✅ aiResponse mise à jour pour l'échange non fini: ${taskData.aiResponseId}`);
    } else {
      console.warn(`⚠️ Aucun aiResponseId fourni pour l'échange non fini de la conversation: ${taskData.conversationId}`);
    }

    return {
      success: true,
      response: unfinishedMessage,
      messageId: unfinishedResponse.messageId,
      workerId: 'google-cloud-tasks',
      lastUserAction: lastAnswer
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
