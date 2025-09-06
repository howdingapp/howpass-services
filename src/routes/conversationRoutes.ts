import { Router } from 'express';
import { ConversationController } from '../controllers/ConversationController';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authMiddleware';

const router = Router();
const conversationController = new ConversationController();

/**
 * Routes pour la gestion des conversations
 */

// Démarrer une nouvelle conversation
router.post('/start', authenticateToken, (req: AuthenticatedRequest, res) => {
  conversationController.startConversation(req, res);
});

// Ajouter un message à une conversation
router.post('/:id/message', authenticateToken, (req: AuthenticatedRequest, res) => {
  conversationController.addMessage(req, res);
});

// Générer le résumé IA d'une conversation
router.post('/:id/summary', authenticateToken, (req: AuthenticatedRequest, res) => {
  conversationController.generateSummary(req, res);
});

// Générer un échange non fini pour une conversation
router.post('/:id/unfinished-exchange', authenticateToken, (req: AuthenticatedRequest, res) => {
  conversationController.generateUnfinishedExchange(req, res);
});

export default router;
