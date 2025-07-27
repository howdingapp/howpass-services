import { Router } from 'express';
import { VideoController } from '../controllers/VideoController';

const router = Router();
const videoController = new VideoController();

// Route de santé
router.get('/health', (req, res) => videoController.getHealth(req, res));

// Route de webhook pour les changements de base de données Supabase
router.post('/webhook/database', (req, res) => videoController.handleDatabaseWebhook(req, res));

// Route de statut d'un job
router.get('/job/:jobId', (req, res) => videoController.getJobStatus(req, res));

export default router; 