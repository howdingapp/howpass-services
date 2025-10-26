import { Request, Response } from 'express';
import { BillingService } from '../services/BillingService';

export class BillingController {
  private billingService: BillingService;

  constructor() {
    this.billingService = new BillingService();
  }

  /**
   * Traite les factures récurrentes du jour et envoie les emails
   */
  async processDailyBilling(_req: Request, res: Response): Promise<void> {
    try {
      console.log('📊 Démarrage du traitement des factures récurrentes');

      const result = await this.billingService.processDailyBilling();

      if (result.success) {
        console.log(`✅ Traitement terminé: ${result.processed} emails envoyés`);
        
        if (result.errors.length > 0) {
          console.error(`❌ ${result.errors.length} erreurs rencontrées:`, result.errors);
        }

        res.status(200).json({
          success: true,
          processed: result.processed,
          errors: result.errors,
          message: `${result.processed} emails de facturation envoyés avec succès`
        });
      } else {
        console.error('❌ Échec du traitement des factures');
        
        res.status(500).json({
          success: false,
          processed: result.processed,
          errors: result.errors,
          message: 'Erreur lors du traitement des factures récurrentes'
        });
      }
    } catch (error) {
      console.error('❌ Erreur lors du traitement des factures récurrentes:', error);
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        message: 'Erreur interne du serveur'
      });
    }
  }
}

