import { Request, Response } from 'express';
import { CloudRunJobsService, JobPayload } from '../services/CloudRunJobsService';
import { SupabaseService } from '../services/SupabaseService';
import { RgpdJobPayload, RgpdApiResponse } from '../types/rgpd';

interface DatabaseWebhookPayload {
  type: string;
  table: string;
  record: any;
  old_record?: any;
}

export class GprdRequestController {
  private cloudRunJobsService: CloudRunJobsService;
  private supabaseService: SupabaseService;

  constructor() {
    this.cloudRunJobsService = new CloudRunJobsService();
    this.supabaseService = new SupabaseService();
  }

  /**
   * Gère les webhooks de la base de données pour les demandes RGPD
   */
  async handleDatabaseWebhook(req: Request, res: Response): Promise<void> {
    try {
      const payload: DatabaseWebhookPayload = req.body;
      const { type, table, record } = payload;

      console.log('📊 Webhook RGPD reçu:', {
        type,
        table,
        recordId: record?.id,
        requestType: record?.request_type,
        status: record?.status
      });

      // Vérifier le type d'opération
      if (type !== 'INSERT' && type !== 'UPDATE') {
        console.log('⏭️ Type d\'opération ignoré:', type);
        res.status(200).json({
          success: true,
          message: 'Type d\'opération ignoré'
        });
        return;
      }

      // Vérifier la table
      if (table !== 'gprd_requests') {
        console.log('⏭️ Table ignorée:', table);
        res.status(200).json({
          success: true,
          message: 'Table ignorée'
        });
        return;
      }

      // Vérifier le statut de la demande
      if (record?.status !== 'pending') {
        console.log('⏭️ Demande non en attente, statut:', record?.status);
        res.status(200).json({
          success: true,
          message: 'Demande non en attente'
        });
        return;
      }

      // Valider les champs requis
      if (!record?.id || !record?.user_id || !record?.request_type || !record?.email) {
        console.error('❌ Champs requis manquants dans la demande RGPD:', {
          id: record?.id,
          userId: record?.user_id,
          requestType: record?.request_type,
          email: record?.email
        });
        res.status(400).json({
          success: false,
          error: 'Champs requis manquants',
          message: 'id, user_id, request_type et email sont requis'
        });
        return;
      }

      console.log('🔄 Traitement de la demande RGPD:', {
        requestId: record.id,
        userId: record.user_id,
        requestType: record.request_type,
        email: record.email
      });

      // Marquer la demande comme en cours de traitement
      await this.markRequestAsProcessing(record.id);

      // Créer le payload du job
      const jobPayload: RgpdJobPayload = {
        requestId: record.id,
        userId: record.user_id,
        requestType: record.request_type,
        email: record.email,
        metadata: {
          webhookSource: 'database',
          requestTimestamp: record.requested_at,
          priority: this.getPriorityFromRequestType(record.request_type)
        }
      };

      // Créer un job Cloud Run pour le traitement en arrière-plan
      const jobName = await this.createRgpdJob(jobPayload);

      // Retourner immédiatement pour indiquer que le webhook est accepté
      res.status(200).json({
        success: true,
        message: 'Webhook RGPD accepté, job créé',
        jobName,
        requestId: record.id,
        metadata: {
          table,
          recordId: record.id,
          operation: type,
          requestType: record.request_type
        }
      });

    } catch (error) {
      console.error('❌ Erreur lors du traitement du webhook RGPD:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur interne du serveur'
      });
    }
  }

  /**
   * Gère les demandes RGPD directes (API)
   */
  async handleRgpdRequest(req: Request, res: Response): Promise<void> {
    try {
      const { userId, requestType, email } = req.body;

      // Validation des champs requis
      if (!userId || !requestType || !email) {
        res.status(400).json({
          success: false,
          error: 'Champs requis manquants',
          message: 'userId, requestType et email sont requis'
        });
        return;
      }

      // Validation du type de demande
      const validRequestTypes = ['data_export', 'data_deletion', 'data_portability'];
      if (!validRequestTypes.includes(requestType)) {
        res.status(400).json({
          success: false,
          error: 'Type de demande invalide',
          message: `Type de demande doit être l'un de: ${validRequestTypes.join(', ')}`
        });
        return;
      }

      console.log('📋 Demande RGPD directe reçue:', {
        userId,
        requestType,
        email
      });

      // Créer une entrée dans la base de données
      const requestId = await this.createRgpdRequest(userId, requestType, email);

      // Créer le payload du job
      const jobPayload: RgpdJobPayload = {
        requestId,
        userId,
        requestType,
        email,
        metadata: {
          webhookSource: 'api',
          requestTimestamp: new Date().toISOString(),
          priority: this.getPriorityFromRequestType(requestType)
        }
      };

      // Créer un job Cloud Run pour le traitement en arrière-plan
      await this.createRgpdJob(jobPayload);

      const response: RgpdApiResponse = {
        success: true,
        message: 'Demande RGPD créée avec succès',
        requestId
        // downloadUrl sera fourni après traitement
      };

      res.status(200).json(response);

    } catch (error) {
      console.error('❌ Erreur lors de la création de la demande RGPD:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur interne du serveur'
      });
    }
  }

  /**
   * Vérifie le statut d'une demande RGPD
   */
  async getRequestStatus(req: Request, res: Response): Promise<void> {
    try {
      const { requestId } = req.params;

      if (!requestId) {
        res.status(400).json({
          success: false,
          error: 'ID de demande requis'
        });
        return;
      }

      const request = await this.getRgpdRequest(requestId);

      if (!request) {
        res.status(404).json({
          success: false,
          error: 'Demande non trouvée'
        });
        return;
      }

      res.json({
        success: true,
        request
      });

    } catch (error) {
      console.error('❌ Erreur lors de la récupération du statut:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur interne du serveur'
      });
    }
  }

  /**
   * Marque une demande comme en cours de traitement
   */
  private async markRequestAsProcessing(requestId: string): Promise<void> {
    const { error } = await this.supabaseService.getSupabaseClient()
      .from('gprd_requests')
      .update({ 
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (error) {
      console.error('❌ Erreur lors de la mise à jour du statut:', error);
      throw new Error(`Erreur lors de la mise à jour du statut: ${error.message}`);
    }

    console.log(`✅ Demande ${requestId} marquée comme en cours de traitement`);
  }


  /**
   * Crée une demande RGPD dans la base de données
   */
  private async createRgpdRequest(userId: string, requestType: string, email: string): Promise<string> {
    const { data, error } = await this.supabaseService.getSupabaseClient()
      .from('gprd_requests')
      .insert({
        user_id: userId,
        request_type: requestType,
        email: email,
        status: 'pending',
        requested_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('❌ Erreur lors de la création de la demande RGPD:', error);
      throw new Error(`Erreur lors de la création de la demande: ${error?.message}`);
    }

    console.log(`✅ Demande RGPD créée: ${data.id}`);
    return data.id;
  }


  /**
   * Récupère une demande RGPD par son ID
   */
  private async getRgpdRequest(requestId: string): Promise<any> {
    const { data, error } = await this.supabaseService.getSupabaseClient()
      .from('gprd_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  }

  /**
   * Crée un job Cloud Run pour le traitement RGPD
   */
  private async createRgpdJob(jobPayload: RgpdJobPayload): Promise<string> {
    const jobPayloadWrapper: JobPayload = {
      rgpdRequest: jobPayload
    };

    const jobName = await this.cloudRunJobsService.createRgpdProcessingJob(jobPayloadWrapper);
    console.log(`✅ Job RGPD créé: ${jobName}`);
    return jobName;
  }

  /**
   * Détermine la priorité basée sur le type de demande
   */
  private getPriorityFromRequestType(requestType: string): 'low' | 'medium' | 'high' {
    switch (requestType) {
      case 'data_deletion':
        return 'high'; // Suppression = priorité haute
      case 'data_export':
        return 'medium'; // Export = priorité moyenne
      case 'data_portability':
        return 'low'; // Portabilité = priorité basse
      default:
        return 'medium';
    }
  }

}
