import { Router } from 'express';
import { BillingController } from '../controllers/BillingController';

const router = Router();
const billingController = new BillingController();

// Route pour traiter les factures récurrentes du jour
router.post('/process-daily', (req, res) => billingController.processDailyBilling(req, res));

export default router;

