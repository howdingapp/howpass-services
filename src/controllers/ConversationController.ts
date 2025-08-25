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
    try {
      const request: StartConversationRequest = req.body;

      // Validation des données
      if (!request.userId || !request.type) {
        res.status(400).json({
          success: false,
          error: 'userId et type sont requis'
        });
        return;
      }

      if (!['bilan', 'activity'].includes(request.type)) {
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
      console.log(`🚀 Nouvelle conversation démarrée: ${conversationId} (${request.type})`);
    } catch (error) {
      console.error('❌ Erreur lors du démarrage de la conversation:', error);
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
    try {
      const { id: conversationId } = req.params;
      if (!conversationId) {
        res.status(400).json({
          success: false,
          error: 'conversationId est requis'
        });
        return;
      }
      const request: AddMessageRequest = req.body;

      // Validation des données
      if (!request.content || !request.type) {
        res.status(400).json({
          success: false,
          error: 'content et type sont requis'
        });
        return;
      }

      if (!['user', 'bot'].includes(request.type)) {
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
      console.log(`💬 Message ajouté à la conversation ${conversationId}: ${messageId}`);
    } catch (error) {
      if (error instanceof Error && error.message === 'Conversation not found') {
        res.status(404).json({
          success: false,
          error: 'Conversation non trouvée'
        });
      } else if (error instanceof Error && error.message === 'Conversation is not active') {
        res.status(400).json({
          success: false,
          error: 'La conversation n\'est plus active'
        });
      } else {
        console.error('❌ Erreur lors de l\'ajout du message:', error);
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
    try {
      const { id: conversationId } = req.params;
      if (!conversationId) {
        res.status(400).json({
          success: false,
          error: 'conversationId est requis'
        });
        return;
      }
      const context = await this.conversationService.getContext(conversationId);

      if (!context) {
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
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du contexte:', error);
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
    try {
      const { id: conversationId } = req.params;
      if (!conversationId) {
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
      console.log(`✅ Conversation terminée: ${conversationId} - ${summary.messageCount} messages`);
    } catch (error) {
      if (error instanceof Error && error.message === 'Conversation not found') {
        res.status(404).json({
          success: false,
          error: 'Conversation non trouvée'
        });
      } else {
        console.error('❌ Erreur lors de la terminaison de la conversation:', error);
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
  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.conversationService.getStats();
      res.status(200).json({
        success: true,
        ...stats
      });
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des statistiques:', error);
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
  async forceCleanup(_req: Request, res: Response): Promise<void> {
    try {
      await this.conversationService.forceCleanup();
      res.status(200).json({
        success: true,
        message: 'Nettoyage forcé effectué'
      });
      console.log('🧹 Nettoyage forcé effectué');
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage forcé:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  }
}
