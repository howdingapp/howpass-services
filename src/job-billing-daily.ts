import { BillingService } from './services/BillingService';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

/**
 * Job quotidien pour traiter les facturations récurrentes mensuelles et annuelles
 * Ce job vérifie toutes les subscriptions Stripe actives et envoie les emails de facturation
 * aux clients qui ont été facturés aujourd'hui
 */
async function processDailyBilling() {
  try {
    console.log('📊 Démarrage du traitement des factures récurrentes quotidiennes...');

    const billingService = new BillingService();

    // Traiter toutes les facturations du jour
    const result = await billingService.processDailyBilling();

    if (result.success) {
      console.log(`✅ Traitement terminé avec succès`);
      console.log(`📧 ${result.processed} email(s) de facturation envoyé(s)`);
      
      if (result.errors.length > 0) {
        console.warn(`⚠️ ${result.errors.length} erreur(s) rencontrée(s):`);
        result.errors.forEach((error, index) => {
          console.warn(`  ${index + 1}. User ID: ${error.userId}, Erreur: ${error.error}`);
        });
      }

      process.exit(0);
    } else {
      console.error('❌ Échec du traitement des factures récurrentes');
      console.error('Erreurs:', result.errors);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Erreur lors du traitement des factures récurrentes:', error);
    process.exit(1);
  }
}

// Démarrer le traitement si ce fichier est exécuté directement
if (require.main === module) {
  processDailyBilling();
}

export { processDailyBilling };

