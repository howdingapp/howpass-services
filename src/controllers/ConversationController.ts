import { Request, Response } from 'express';
import { ConversationService } from '../services/ConversationService';
import {
  StartConversationRequest,
  AddMessageRequest,
  StartConversationResponse,
  AddMessageResponse,
  GetContextResponse,
  EndConversationResponse
} from '../types/conversation';

export class ConversationController {
  private conversationService: ConversationService;

  constructor() {
    this.conversationService = new ConversationService();
  }

  /**
   * Démarrer une nouvelle conversation
   * POST /api/conversations/start
   */
  async startConversation(req: Request, res: Response): Promise<void> {
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

      const { conversationId, context } = await this.conversationService.startConversation(request);

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
   * Ajouter un message à une conversation
   * POST /api/conversations/:id/message
   */
  async addMessage(req: Request, res: Response): Promise<void> {
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

      const { messageId, context } = await this.conversationService.addMessage(conversationId, request);

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
   * Récupérer le contexte d'une conversation
   * GET /api/conversations/:id/context
   */
  async getContext(req: Request, res: Response): Promise<void> {
    console.log('📝 [GET_CONTEXT] Requête reçue:', {
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
        console.log('❌ [GET_CONTEXT] conversationId manquant dans les paramètres');
        res.status(400).json({
          success: false,
          error: 'conversationId est requis'
        });
        return;
      }
      const context = await this.conversationService.getContext(conversationId);

      if (!context) {
        console.log(`❌ [GET_CONTEXT] Conversation non trouvée ou expirée: ${conversationId}`);
        res.status(404).json({
          success: false,
          error: 'Conversation non trouvée ou expirée'
        });
        return;
      }

      const response: GetContextResponse = {
        success: true,
        context
      };

      res.status(200).json(response);
      console.log(`📋 [GET_CONTEXT] Contexte récupéré pour la conversation: ${conversationId}`);
    } catch (error) {
      console.error('❌ [GET_CONTEXT] Erreur lors de la récupération du contexte:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  }

  /**
   * Terminer une conversation
   * POST /api/conversations/:id/end
   */
  async endConversation(req: Request, res: Response): Promise<void> {
    console.log('📝 [END_CONVERSATION] Requête reçue:', {
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
        console.log('❌ [END_CONVERSATION] conversationId manquant dans les paramètres');
        res.status(400).json({
          success: false,
          error: 'conversationId est requis'
        });
        return;
      }
      const summary = await this.conversationService.endConversation(conversationId);

      const response: EndConversationResponse = {
        success: true,
        summary
      };

      res.status(200).json(response);
      console.log(`✅ [END_CONVERSATION] Conversation terminée: ${conversationId} - ${summary.messageCount} messages`);
    } catch (error) {
      if (error instanceof Error && error.message === 'Conversation not found') {
        console.log(`❌ [END_CONVERSATION] Conversation non trouvée: ${req.params['id']}`);
        res.status(404).json({
          success: false,
          error: 'Conversation non trouvée'
        });
      } else {
        console.error('❌ [END_CONVERSATION] Erreur lors de la terminaison de la conversation:', error);
        res.status(500).json({
          success: false,
          error: 'Erreur interne du serveur'
        });
      }
    }
  }

  /**
   * Obtenir les statistiques du service
   * GET /api/conversations/stats
   */
  async getStats(req: Request, res: Response): Promise<void> {
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
  async forceCleanup(req: Request, res: Response): Promise<void> {
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
