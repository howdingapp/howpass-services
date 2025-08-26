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



// Générer le résumé IA d'une conversation
router.post('/:id/summary', (req, res) => {
  conversationController.generateSummary(req, res);
});


export default router;
