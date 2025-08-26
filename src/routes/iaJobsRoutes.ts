import express from 'express';
import { IAJobTriggerService } from '../services/IAJobTriggerService';

const router = express.Router();
const iaJobService = new IAJobTriggerService();

/**
 * POST /api/ia/jobs/trigger
 * Déclencher un job IA
 */
router.post('/trigger', async (req, res) => {
  try {
    const { type, conversationId, userId, userMessage, priority } = req.body;

    // Validation des paramètres
    if (!type || !conversationId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Paramètres manquants: type, conversationId, userId sont requis'
      });
    }

    // Validation du type de job
    const validTypes = ['generate_response', 'generate_summary', 'generate_first_response'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Type de job invalide. Types valides: ${validTypes.join(', ')}`
      });
    }

    // Déclencher le job
    const result = await iaJobService.triggerIAJob({
      type,
      conversationId,
      userId,
      userMessage,
      priority
    });

    return res.json({
      success: true,
      message: 'Job IA déclenché avec succès',
      data: result
    });

  } catch (error) {
    console.error('❌ Erreur lors du déclenchement du job IA:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Erreur interne du serveur'
    });
  }
});

/**
 * POST /api/ia/jobs/trigger-batch
 * Déclencher plusieurs jobs IA en parallèle
 */
router.post('/trigger-batch', async (req, res) => {
  try {
    const { jobs } = req.body;

    if (!Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Le paramètre jobs doit être un tableau non vide'
      });
    }

    if (jobs.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 jobs peuvent être déclenchés simultanément'
      });
    }

    // Déclencher les jobs en parallèle
    const result = await iaJobService.triggerMultipleIAJobs(jobs);

    return res.json({
      success: true,
      message: `${result.totalJobs} jobs IA déclenchés avec succès`,
      data: result
    });

  } catch (error) {
    console.error('❌ Erreur lors du déclenchement des jobs IA en lot:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Erreur interne du serveur'
    });
  }
});

/**
 * GET /api/ia/jobs/status/:jobId
 * Vérifier le statut d'un job IA
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'ID du job requis'
      });
    }

    const status = await iaJobService.getJobStatus(jobId);

    return res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('❌ Erreur lors de la vérification du statut du job:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Erreur interne du serveur'
    });
  }
});

/**
 * GET /api/ia/jobs/stats
 * Obtenir les statistiques de la queue
 */
router.get('/stats', async (_req, res) => {
  try {
    const stats = await iaJobService.getQueueStats();

    return res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des statistiques:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Erreur interne du serveur'
    });
  }
});

/**
 * POST /api/ia/jobs/cleanup
 * Nettoyer les anciens jobs terminés
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { maxAgeHours = 24 } = req.body;

    if (maxAgeHours < 1 || maxAgeHours > 168) { // 1 heure à 1 semaine
      return res.status(400).json({
        success: false,
        error: 'maxAgeHours doit être entre 1 et 168'
      });
    }

    const result = await iaJobService.cleanupOldJobs(maxAgeHours);

    return res.json({
      success: true,
      message: `Nettoyage des jobs terminés depuis ${maxAgeHours}h effectué`,
      data: result
    });

  } catch (error) {
    console.error('❌ Erreur lors du nettoyage des jobs:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Erreur interne du serveur'
    });
  }
});

/**
 * GET /api/ia/jobs/health
 * Vérifier la santé du service
 */
router.get('/health', async (_req, res) => {
  try {
    const stats = await iaJobService.getQueueStats();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      queue: stats.stats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env['npm_package_version'] || '1.0.0'
    };

    return res.json({
      success: true,
      data: health
    });

  } catch (error) {
    console.error('❌ Erreur lors de la vérification de la santé:', error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || 'Erreur interne du serveur'
    });
  }
});

export default router;
