import { Router } from 'express';
import { BilanController } from '../controllers/BilanController';

const router = Router();
const bilanController = new BilanController();

// Route principale pour générer un bilan
router.post('/generate', (req, res) => bilanController.generateBilan(req, res));

// Configuration de l'agent
router.get('/config', (req, res) => bilanController.getConfig(req, res));
router.put('/config', (req, res) => bilanController.updateConfig(req, res));

// Gestion du cache
router.post('/cache/clear', (req, res) => bilanController.clearCache(req, res));
router.post('/cache/refresh', (req, res) => bilanController.refreshCache(req, res));

// Santé de l'agent
router.get('/health', (req, res) => bilanController.healthCheck(req, res));

export default router;
