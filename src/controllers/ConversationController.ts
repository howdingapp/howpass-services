import { Response } from 'express';
import { ConversationService } from '../services/ConversationService';
import { IAJobTriggerService } from '../services/IAJobTriggerService';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import {
  StartConversationRequest,
  AddMessageRequest,
  StartConversationResponse,
  GenerateSummaryRequest
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

      if (!['bilan', 'activity', 'recommandation', 'unfinished_exchange'].includes(request.type)) {
        console.log('❌ [START_CONVERSATION] Type invalide:', { type: request.type });
        res.status(400).json({
          success: false,
          error: 'type doit être dans la liste des types valides (bilan, activity, recommandation, unfinished_exchange)'
        });
        return;
      }

      const conversationId = request.conversationId;

      // Déclencher automatiquement la première réponse IA
      try {
        const iaJob = await this.iaJobTriggerService.triggerIAJob({
          type: 'generate_first_response',
          conversationId: conversationId,
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

      try {
        const iaJob = await this.iaJobTriggerService.triggerIAJob({
            type: 'generate_response',
            conversationId,
            userMessage: request.content,
            priority: 'medium',
            aiResponseId: request.aiResponseId
          }, req.authToken || '');

          console.log(`🤖 [ADD_MESSAGE] Job IA déclenché pour la réponse: ${iaJob.jobId}`);
        } catch (iaError) {
          console.warn(`⚠️ [ADD_MESSAGE] Erreur lors du déclenchement du job IA (non bloquant):`, iaError);
        }

        const response = {
          success: true,
        };

      res.status(200).json(response);
      console.log(`💬 [ADD_MESSAGE] Message ajouté à la conversation ${conversationId}: ${request.content}`);
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
      const request: GenerateSummaryRequest = req.body;

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
          aiResponseId: request.aiResponseId,
          priority: 'high'
        }, req.authToken || '');

        console.log(`🤖 [GENERATE_SUMMARY] Job IA déclenché pour le résumé: ${iaJob.jobId}`);

        res.status(200).json({
          success: true,
          message: 'Génération du résumé IA déclenchée avec succès',
          jobId: iaJob.jobId,
          estimatedTime: iaJob.estimatedTime,
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
   * Générer un échange non fini pour une conversation
   * POST /api/conversations/:id/unfinished-exchange
   */
  async generateUnfinishedExchange(req: AuthenticatedRequest, res: Response): Promise<void> {
    console.log('📝 [GENERATE_UNFINISHED_EXCHANGE] Requête reçue:', {
      method: req.method,
      url: req.url,
      params: req.params,
      headers: {
        'user-agent': req.headers['user-agent'],
        'authorization': req.headers.authorization ? '***' : undefined
      },
      body: req.body,
      timestamp: new Date().toISOString()
    });

    try {
      const { id: conversationId } = req.params;
      if (!conversationId) {
        console.log('❌ [GENERATE_UNFINISHED_EXCHANGE] conversationId manquant dans les paramètres');
        res.status(400).json({
          success: false,
          error: 'conversationId est requis'
        });
        return;
      }

      const { userId, aiResponseId, lastAnswer } = req.body;

      // Validation des données
      if (!userId) {
        console.log('❌ [GENERATE_UNFINISHED_EXCHANGE] Validation échouée:', { userId });
        res.status(400).json({
          success: false,
          error: 'userId est requis'
        });
        return;
      }

      // Récupérer le contexte de la conversation
      const context = await this.conversationService.getContext(conversationId);
      if (!context) {
        console.log(`❌ [GENERATE_UNFINISHED_EXCHANGE] Conversation non trouvée: ${conversationId}`);
        res.status(404).json({
          success: false,
          error: 'Conversation non trouvée'
        });
        return;
      }

      // Déclencher la génération de l'échange non fini
      try {
        const iaJob = await this.iaJobTriggerService.triggerIAJob({
          type: 'generate_unfinished_exchange',
          conversationId,
          aiResponseId,
          lastAnswer: lastAnswer || '',
          priority: 'high'
        }, req.authToken || '');

        console.log(`🤖 [GENERATE_UNFINISHED_EXCHANGE] Job IA déclenché pour l'échange non fini: ${iaJob.jobId}`);

        res.status(200).json({
          success: true,
          message: 'Génération de l\'échange non fini déclenchée avec succès',
          jobId: iaJob.jobId,
          estimatedTime: iaJob.estimatedTime,
        });

      } catch (iaError) {
        console.error('❌ [GENERATE_UNFINISHED_EXCHANGE] Erreur lors du déclenchement du job IA:', iaError);
        res.status(500).json({
          success: false,
          error: 'Erreur lors du déclenchement de la génération de l\'échange non fini'
        });
      }

    } catch (error) {
      console.error('❌ [GENERATE_UNFINISHED_EXCHANGE] Erreur lors de la génération de l\'échange non fini:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  }

}
