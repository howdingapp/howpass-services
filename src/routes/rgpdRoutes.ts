import { Router } from 'express';
import { GprdRequestController } from '../controllers/GprdRequestController';

const router = Router();
const rgpdController = new GprdRequestController();

// Route de webhook pour les changements de base de données Supabase
router.post('/webhook/database', (req, res) => rgpdController.handleDatabaseWebhook(req, res));

// Route pour vérifier le statut d'une demande RGPD
router.get('/request/:requestId', (req, res) => rgpdController.getRequestStatus(req, res));

export default router;
