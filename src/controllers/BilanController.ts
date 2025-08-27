import { Request, Response } from 'express';
import { BilanAgentRAG } from '../services/BilanAgentRAG';
import { BilanRequest, BilanResponse } from '../types/bilan';

export class BilanController {
  private bilanAgent: BilanAgentRAG;

  constructor() {
    this.bilanAgent = new BilanAgentRAG();
  }

  /**
   * Génère un bilan et des recommandations d'activités
   * POST /api/bilan/generate
   */
  async generateBilan(req: Request, res: Response): Promise<void> {
    try {
      const { userId, userState, context } = req.body;

      // Validation des paramètres requis
      if (!userId || !userState) {
        res.status(400).json({
          success: false,
          error: 'userId et userState sont requis'
        });
        return;
      }

      const request: BilanRequest = {
        userId,
        userState,
        context
      };

      const response: BilanResponse = await this.bilanAgent.generateBilan(request);

      if (response.success) {
        res.status(200).json(response);
      } else {
        res.status(500).json(response);
      }

    } catch (error) {
      console.error('Erreur dans generateBilan:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur',
        recommendations: [],
        analysis: {
          emotionalState: 'Erreur lors de l\'analyse',
          currentNeeds: [],
          potentialChallenges: [],
          growthAreas: [],
          recommendedApproach: 'Approche non définie'
        },
        suggestions: []
      });
    }
  }

  /**
   * Met à jour la configuration de l'agent
   * PUT /api/bilan/config
   */
  async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = req.body;
      
      this.bilanAgent.updateConfig(config);
      
      res.status(200).json({
        success: true,
        message: 'Configuration mise à jour avec succès',
        config: this.bilanAgent.getConfig()
      });

    } catch (error) {
      console.error('Erreur dans updateConfig:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la mise à jour de la configuration'
      });
    }
  }

  /**
   * Récupère la configuration actuelle
   * GET /api/bilan/config
   */
  async getConfig(_req: Request, res: Response): Promise<void> {
    try {
      const config = this.bilanAgent.getConfig();
      
      res.status(200).json({
        success: true,
        config
      });

    } catch (error) {
      console.error('Erreur dans getConfig:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération de la configuration'
      });
    }
  }

  /**
   * Vide le cache des documents
   * POST /api/bilan/cache/clear
   */
  async clearCache(_req: Request, res: Response): Promise<void> {
    try {
      this.bilanAgent.clearCache();
      
      res.status(200).json({
        success: true,
        message: 'Cache vidé avec succès'
      });

    } catch (error) {
      console.error('Erreur dans clearCache:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors du vidage du cache'
      });
    }
  }

  /**
   * Rafraîchit le cache des documents
   * POST /api/bilan/cache/refresh
   */
  async refreshCache(_req: Request, res: Response): Promise<void> {
    try {
      await this.bilanAgent.refreshCache();
      
      res.status(200).json({
        success: true,
        message: 'Cache rafraîchi avec succès'
      });

    } catch (error) {
      console.error('Erreur dans refreshCache:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors du rafraîchissement du cache'
      });
    }
  }

  /**
   * Teste la santé de l'agent
   * GET /api/bilan/health
   */
  async healthCheck(_req: Request, res: Response): Promise<void> {
    try {
      const config = this.bilanAgent.getConfig();
      
      res.status(200).json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        config: {
          modelName: config.modelName,
          temperature: config.temperature,
          maxTokens: config.maxTokens
        }
      });

    } catch (error) {
      console.error('Erreur dans healthCheck:', error);
      res.status(500).json({
        success: false,
        status: 'unhealthy',
        error: 'Erreur lors de la vérification de la santé'
      });
    }
  }
}
