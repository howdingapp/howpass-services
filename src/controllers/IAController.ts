import { Request, Response } from 'express';
import { ChatBotService } from '../services/ChatBotService';
import { ConversationService } from '../services/ConversationService';
import { SupabaseService } from '../services/SupabaseService';
import { ConversationContext } from '../types/conversation';

interface IATaskRequest {
  type: 'generate_response' | 'generate_summary' | 'generate_first_response';
  conversationId: string;
  userId: string;
  userMessage?: string;
  priority: 'low' | 'medium' | 'high';
  authToken: string; // Token d'authentification pour sécuriser les tâches
}

export class IAController {
  private chatBotService: ChatBotService;
  private conversationService: ConversationService;
  private supabaseService: SupabaseService;

  constructor() {
    this.chatBotService = new ChatBotService();
    this.conversationService = new ConversationService();
    this.supabaseService = new SupabaseService();
  }

  /**
   * Traiter une tâche IA reçue de Google Cloud Tasks
   * POST /api/ia/process
   */
  async processIATask(req: Request, res: Response): Promise<void> {
    console.log('🤖 [PROCESS_IA_TASK] Tâche IA reçue:', {
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
        'x-task-priority': req.headers['x-task-priority'],
        'x-conversation-id': req.headers['x-conversation-id']
      },
      body: req.body,
      timestamp: new Date().toISOString()
    });

    try {
      const taskData: IATaskRequest = req.body;

      // ✅ Validation des données et de l'authentification
      if (!taskData.type || !taskData.conversationId || !taskData.userId || !taskData.authToken) {
        console.log('❌ [PROCESS_IA_TASK] Validation échouée:', { 
          type: taskData.type, 
          conversationId: taskData.conversationId, 
          userId: taskData.userId,
          hasAuthToken: !!taskData.authToken
        });
        res.status(400).json({
          success: false,
          error: 'type, conversationId, userId et authToken sont requis'
        });
        return;
      }

      // ✅ Vérifier l'authentification avec le token reçu
      const isValidToken = await this.validateAuthToken(taskData.authToken);
      if (!isValidToken) {
        console.log('❌ [PROCESS_IA_TASK] Token d\'authentification invalide');
        res.status(401).json({ error: 'Invalid auth token' });
        return;
      }

      // Vérifier que la conversation existe et est active
      const context = await this.conversationService.getContext(taskData.conversationId);
      if (!context) {
        console.log(`❌ [PROCESS_IA_TASK] Conversation non trouvée: ${taskData.conversationId}`);
        res.status(404).json({
          success: false,
          error: 'Conversation non trouvée'
        });
        return;
      }

      if (context.status !== 'active') {
        console.log(`❌ [PROCESS_IA_TASK] Conversation non active: ${taskData.conversationId}`);
        res.status(400).json({
          success: false,
          error: 'La conversation n\'est plus active'
        });
        return;
      }

      console.log(`🔧 [PROCESS_IA_TASK] Traitement de la tâche: ${taskData.type} pour ${taskData.conversationId}`);

      let result: any;
      const startTime = Date.now();

      try {
        // Traiter selon le type de tâche
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
          default:
            throw new Error(`Type de tâche non supporté: ${taskData.type}`);
        }

        const processingTime = Date.now() - startTime;

        console.log(`✅ [PROCESS_IA_TASK] Tâche traitée avec succès: ${taskData.type} en ${processingTime}ms`);

        res.status(200).json({
          success: true,
          taskType: taskData.type,
          conversationId: taskData.conversationId,
          processingTime: `${processingTime}ms`,
          result
        });

      } catch (processingError) {
        const processingTime = Date.now() - startTime;
        console.error(`❌ [PROCESS_IA_TASK] Erreur lors du traitement:`, processingError);

        res.status(500).json({
          success: false,
          taskType: taskData.type,
          conversationId: taskData.conversationId,
          processingTime: `${processingTime}ms`,
          error: (processingError as Error).message
        });
      }

    } catch (error) {
      console.error('❌ [PROCESS_IA_TASK] Erreur fatale:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur'
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
    
    // Générer la réponse IA
    const aiResponse = await this.chatBotService['generateAIResponse'](context, taskData.userMessage);
    
    // Ajouter la réponse à la conversation
    await this.conversationService.addMessage(taskData.conversationId, {
      content: aiResponse,
      type: 'bot',
      metadata: { source: 'ai', model: this.chatBotService.getAIModel() }
    });

    // Enregistrer dans Supabase
    await this.supabaseService.createAIResponse({
      conversation_id: taskData.conversationId,
      user_id: taskData.userId,
      response_text: aiResponse,
      message_type: 'text'
    });

    return {
      success: true,
      response: aiResponse,
      messageId: `msg_${Date.now()}`,
      workerId: 'google-cloud-tasks'
    };
  }

  /**
   * Traiter la génération d'un résumé IA
   */
  private async processGenerateSummary(taskData: IATaskRequest, context: ConversationContext): Promise<any> {
    console.log(`📝 Génération d'un résumé IA pour: ${taskData.conversationId}`);
    
    const summary = await this.chatBotService['generateConversationSummary'](context);
    
    // Sauvegarder le résumé dans la table appropriée selon le contexte
    try {
      if (context.type === 'bilan') {
        // Extraire l'ID du bilan depuis les métadonnées
        const bilanId = context.metadata?.['bilanId'] || context.metadata?.['bilan_id'];
        if (bilanId) {
          await this.supabaseService.updateBilanAISummary(bilanId, summary);
          console.log(`✅ Résumé IA sauvegardé dans le bilan: ${bilanId}`);
        } else {
          console.warn(`⚠️ ID du bilan non trouvé dans les métadonnées pour la conversation: ${taskData.conversationId}`);
        }
      } else if (context.type === 'activity') {
        // Extraire l'ID de l'activité depuis les métadonnées
        const activityId = context.metadata?.['activityId'] || context.metadata?.['activity_id'];
        if (activityId) {
          await this.supabaseService.updateActivityAISummary(activityId, summary);
          console.log(`✅ Résumé IA sauvegardé dans l'activité: ${activityId}`);
        } else {
          console.warn(`⚠️ ID de l'activité non trouvé dans les métadonnées pour la conversation: ${taskData.conversationId}`);
        }
      }
    } catch (error) {
      console.error(`❌ Erreur lors de la sauvegarde du résumé IA:`, error);
      // Continuer malgré l'erreur de sauvegarde
    }
    
    // TOUJOURS créer une aiResponse pour notifier le frontend
    try {
      // Créer un objet avec le résumé et les métadonnées
      const responseData = {
        summary: summary,
        target_table: context.type === 'bilan' ? 'bilans' : context.type === 'activity' ? 'activities' : 'ai_responses',
        target_id: context.metadata?.['bilanId'] || context.metadata?.['activityId'] || null,
        summary_type: 'conversation_summary'
      };

      await this.supabaseService.createAIResponse({
        conversation_id: taskData.conversationId,
        user_id: taskData.userId,
        response_text: JSON.stringify(responseData),
        message_type: 'summary'
      });
      console.log(`✅ aiResponse créée pour notifier le frontend du résumé disponible`);
    } catch (error) {
      console.error(`❌ Erreur lors de la création de l'aiResponse:`, error);
      // Cette erreur est critique car le frontend ne sera pas notifié
      throw error;
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
    
    const firstResponse = await this.chatBotService['generateFirstResponse'](context);
    
    // Ajouter la réponse à la conversation
    await this.conversationService.addMessage(taskData.conversationId, {
      content: firstResponse,
      type: 'bot',
      metadata: { source: 'ai', model: this.chatBotService.getAIModel(), type: 'first_response' }
    });

    // Enregistrer dans Supabase
    await this.supabaseService.createAIResponse({
      conversation_id: taskData.conversationId,
      user_id: taskData.userId,
      response_text: firstResponse,
      message_type: 'text'
    });

    return {
      success: true,
      response: firstResponse,
      messageId: `msg_${Date.now()}`,
      workerId: 'google-cloud-tasks'
    };
  }

  /**
   * Vérifier la validité du token d'authentification
   */
  private async validateAuthToken(token: string): Promise<boolean> {
    try {
      // ✅ Implémenter votre logique de validation de token ici
      // Pour l'instant, on accepte tous les tokens non vides
      // Vous pouvez ajouter une validation JWT, un appel à votre service d'auth, etc.
      
      if (!token || token.trim() === '') {
        return false;
      }

      // Exemple de validation basique (à remplacer par votre logique)
      // const decoded = jwt.verify(token, process.env['JWT_SECRET']);
      // return !!decoded;

      console.log(`🔐 Validation du token d'authentification: ${token.substring(0, 10)}...`);
      return true; // À remplacer par votre logique de validation

    } catch (error) {
      console.error('❌ Erreur lors de la validation du token:', error);
      return false;
    }
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
