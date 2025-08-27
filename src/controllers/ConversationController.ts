import { Response } from 'express';
import { ConversationService } from '../services/ConversationService';
import { IAJobTriggerService } from '../services/IAJobTriggerService';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import {
  StartConversationRequest,
  AddMessageRequest,
  StartConversationResponse,
  AddMessageResponse
} from '../types/conversation';

export class ConversationController {
  private conversationService: ConversationService;
  private iaJobTriggerService: IAJobTriggerService;

  constructor() {
    this.conversationService = new ConversationService();
    this.iaJobTriggerService = new IAJobTriggerService();
  }

  /**
   * Démarrer une nouvelle conversation
   * POST /api/conversations/start
   */
  async startConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
    console.log('📝 [START_CONVERSATION] Requête reçue:', {
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
        'authorization': req.headers.authorization ? '***' : undefined
      },
      body: req.body,
      timestamp: new Date().toISOString()
    });

    try {
      const request: StartConversationRequest = req.body;

      // Validation des données
      if (!request.userId || !request.type) {
        console.log('❌ [START_CONVERSATION] Validation échouée:', { userId: request.userId, type: request.type });
        res.status(400).json({
          success: false,
          error: 'userId et type sont requis'
        });
        return;
      }

      if (!['bilan', 'activity'].includes(request.type)) {
        console.log('❌ [START_CONVERSATION] Type invalide:', { type: request.type });
        res.status(400).json({
          success: false,
          error: 'type doit être "bilan" ou "activity"'
        });
        return;
      }

      const conversationId = request.conversationId;
      const { context } = await this.conversationService.startConversation(request);

      // Déclencher automatiquement la première réponse IA
      try {
        const iaJob = await this.iaJobTriggerService.triggerIAJob({
          type: 'generate_first_response',
          conversationId: conversationId,
          userId: request.userId,
          priority: 'high',
          aiResponseId: request.aiResponseId
        }, req.authToken || '');

        console.log(`🤖 [START_CONVERSATION] Job IA déclenché pour la première réponse: ${iaJob.jobId}`);
      } catch (iaError) {
        console.warn(`⚠️ [START_CONVERSATION] Erreur lors du déclenchement du job IA (non bloquant):`, iaError);
      }

      const response: StartConversationResponse = {
        success: true,
        conversationId,
        expiresIn: 1800, // 30 minutes en secondes
        context
      };

      res.status(201).json(response);
      console.log(`🚀 [START_CONVERSATION] Nouvelle conversation démarrée: ${conversationId} (${request.type})`);
    } catch (error) {
      console.error('❌ [START_CONVERSATION] Erreur lors du démarrage de la conversation:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  }

  /**
   * Ajouter un message à une conversation et déclencher une réponse IA
   * POST /api/conversations/:id/message
   */
  async addMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    console.log('📝 [ADD_MESSAGE] Requête reçue:', {
      method: req.method,
      url: req.url,
      params: req.params,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
        'authorization': req.headers.authorization ? '***' : undefined
      },
      body: req.body,
      timestamp: new Date().toISOString()
    });

    try {
      const { id: conversationId } = req.params;
      if (!conversationId) {
        console.log('❌ [ADD_MESSAGE] conversationId manquant dans les paramètres');
        res.status(400).json({
          success: false,
          error: 'conversationId est requis'
        });
        return;
      }
      const request: AddMessageRequest = req.body;

      // Validation des données
      if (!request.content || !request.type) {
        console.log('❌ [ADD_MESSAGE] Validation échouée:', { content: request.content, type: request.type });
        res.status(400).json({
          success: false,
          error: 'content et type sont requis'
        });
        return;
      }

      if (!['user', 'bot'].includes(request.type)) {
        console.log('❌ [ADD_MESSAGE] Type de message invalide:', { type: request.type });
        res.status(400).json({
          success: false,
          error: 'type doit être "user" ou "bot"'
        });
        return;
      }

      // Ajouter le message à la conversation
      const { messageId, context } = await this.conversationService.addMessage(conversationId, request);

      // Si c'est un message utilisateur, déclencher une réponse IA
      if (request.type === 'user') {
        try {
                  const iaJob = await this.iaJobTriggerService.triggerIAJob({
          type: 'generate_response',
          conversationId,
          userId: context.userId,
          userMessage: request.content,
          priority: 'medium',
          aiResponseId: request.aiResponseId
        }, req.authToken || '');

          console.log(`🤖 [ADD_MESSAGE] Job IA déclenché pour la réponse: ${iaJob.jobId}`);
        } catch (iaError) {
          console.warn(`⚠️ [ADD_MESSAGE] Erreur lors du déclenchement du job IA (non bloquant):`, iaError);
        }
      }

      const response: AddMessageResponse = {
        success: true,
        messageId,
        context
      };

      res.status(200).json(response);
      console.log(`💬 [ADD_MESSAGE] Message ajouté à la conversation ${conversationId}: ${messageId}`);
    } catch (error) {
      if (error instanceof Error && error.message === 'Conversation not found') {
        console.log(`❌ [ADD_MESSAGE] Conversation non trouvée: ${req.params['id']}`);
        res.status(404).json({
          success: false,
          error: 'Conversation non trouvée'
        });
      } else if (error instanceof Error && error.message === 'Conversation is not active') {
        console.log(`❌ [ADD_MESSAGE] Conversation non active: ${req.params['id']}`);
        res.status(400).json({
          success: false,
          error: 'La conversation n\'est plus active'
        });
      } else {
        console.error('❌ [ADD_MESSAGE] Erreur lors de l\'ajout du message:', error);
        res.status(500).json({
          success: false,
          error: 'Erreur interne du serveur'
        });
      }
    }
  }

  /**
   * Générer le résumé IA d'une conversation et déclencher le nettoyage automatique
   * POST /api/conversations/:id/summary
   */
  async generateSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
    console.log('📝 [GENERATE_SUMMARY] Requête reçue:', {
      method: req.method,
      url: req.url,
      params: req.params,
      headers: {
        'user-agent': req.headers['user-agent'],
        'authorization': req.headers.authorization ? '***' : undefined
      },
      timestamp: new Date().toISOString()
    });

    try {
      const { id: conversationId } = req.params;
      if (!conversationId) {
        console.log('❌ [GENERATE_SUMMARY] conversationId manquant dans les paramètres');
        res.status(400).json({
          success: false,
          error: 'conversationId est requis'
        });
        return;
      }

      // Récupérer le contexte de la conversation
      const context = await this.conversationService.getContext(conversationId);
      if (!context) {
        console.log(`❌ [GENERATE_SUMMARY] Conversation non trouvée: ${conversationId}`);
        res.status(404).json({
          success: false,
          error: 'Conversation non trouvée'
        });
        return;
      }

      // Déclencher la génération du résumé IA
      try {
        const iaJob = await this.iaJobTriggerService.triggerIAJob({
          type: 'generate_summary',
          conversationId,
          userId: context.userId,
          priority: 'high'
        }, req.authToken || '');

        console.log(`🤖 [GENERATE_SUMMARY] Job IA déclenché pour le résumé: ${iaJob.jobId}`);

        // Programmer le nettoyage automatique dans 2 minutes
        setTimeout(async () => {
          try {
            console.log(`🧹 [GENERATE_SUMMARY] Nettoyage automatique de la conversation: ${conversationId}`);
            await this.conversationService.forceCleanup();
            console.log(`✅ [GENERATE_SUMMARY] Nettoyage automatique terminé pour: ${conversationId}`);
          } catch (cleanupError) {
            console.error(`❌ [GENERATE_SUMMARY] Erreur lors du nettoyage automatique:`, cleanupError);
          }
        }, 2 * 60 * 1000); // 2 minutes

        res.status(200).json({
          success: true,
          message: 'Génération du résumé IA déclenchée avec succès',
          jobId: iaJob.jobId,
          estimatedTime: iaJob.estimatedTime,
          cleanupScheduled: '2 minutes'
        });

      } catch (iaError) {
        console.error('❌ [GENERATE_SUMMARY] Erreur lors du déclenchement du job IA:', iaError);
        res.status(500).json({
          success: false,
          error: 'Erreur lors du déclenchement de la génération du résumé'
        });
      }

    } catch (error) {
      console.error('❌ [GENERATE_SUMMARY] Erreur lors de la génération du résumé:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  }



  /**
   * Obtenir les statistiques du service
   * GET /api/conversations/stats
   */
  async getStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    console.log('📝 [GET_STATS] Requête reçue:', {
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'authorization': req.headers.authorization ? '***' : undefined
      },
      timestamp: new Date().toISOString()
    });

    try {
      const stats = await this.conversationService.getStats();
      res.status(200).json({
        success: true,
        ...stats
      });
      console.log('📊 [GET_STATS] Statistiques récupérées avec succès');
    } catch (error) {
      console.error('❌ [GET_STATS] Erreur lors de la récupération des statistiques:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  }

  /**
   * Forcer le nettoyage (pour les tests)
   * POST /api/conversations/cleanup
   */
  async forceCleanup(req: AuthenticatedRequest, res: Response): Promise<void> {
    console.log('📝 [FORCE_CLEANUP] Requête reçue:', {
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'authorization': req.headers.authorization ? '***' : undefined
      },
      timestamp: new Date().toISOString()
    });

    try {
      await this.conversationService.forceCleanup();
      res.status(200).json({
        success: true,
        message: 'Nettoyage forcé effectué'
      });
      console.log('🧹 [FORCE_CLEANUP] Nettoyage forcé effectué');
    } catch (error) {
      console.error('❌ [FORCE_CLEANUP] Erreur lors du nettoyage forcé:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  }
}
