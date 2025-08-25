import { Router } from 'express';
import { ConversationController } from '../controllers/ConversationController';

const router = Router();
const conversationController = new ConversationController();

/**
 * Routes pour la gestion des conversations
 */

// Démarrer une nouvelle conversation
router.post('/start', (req, res) => {
  conversationController.startConversation(req, res);
});

// Ajouter un message à une conversation
router.post('/:id/message', (req, res) => {
  conversationController.addMessage(req, res);
});

// Récupérer le contexte d'une conversation
router.get('/:id/context', (req, res) => {
  conversationController.getContext(req, res);
});

// Terminer une conversation
router.post('/:id/end', (req, res) => {
  conversationController.endConversation(req, res);
});

// Obtenir les statistiques du service
router.get('/stats', (req, res) => {
  conversationController.getStats(req, res);
});

// Forcer le nettoyage (pour les tests)
router.post('/cleanup', (req, res) => {
  conversationController.forceCleanup(req, res);
});

export default router;
