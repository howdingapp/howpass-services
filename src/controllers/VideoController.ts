import { Request, Response } from 'express';
import { MergeWithFullSoundRequest } from '../services/VideoService';
import { CloudRunJobsService, JobPayload } from '../services/CloudRunJobsService';
import { SupabaseService } from '../services/SupabaseService';

interface DatabaseWebhookPayload {
  type: string;
  table: string;
  record: any;
  old_record?: any;
}

export class VideoController {
  private cloudRunJobsService: CloudRunJobsService;
  private supabaseService: SupabaseService;

  constructor() {
    this.cloudRunJobsService = new CloudRunJobsService();
    this.supabaseService = new SupabaseService();
  }

  async handleDatabaseWebhook(req: Request, res: Response): Promise<void> {
    try {
      const payload: DatabaseWebhookPayload = req.body;
      const { type, table, record } = payload;

      console.log('📊 Webhook de base de données reçu:', {
        type,
        table,
        recordId: record?.id,
        hasPresentationVideo: !!record?.presentation_video_public_url
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
      if (table !== 'categories' && table !== 'practices') {
        console.log('⏭️ Table ignorée:', table);
        res.status(200).json({
          success: true,
          message: 'Table ignorée'
        });
        return;
      }

      // Vérifier les statuts des champs QR code
      const qrCodeVideoStatus = record?.qr_code_presentation_video_public_url;
      const qrCodeLessVideoStatus = record?.qr_code_less_presentation_video_public_url;

      // Si aucun champ n'est en 'to_compute', faire un retour immédiat
      if (qrCodeVideoStatus !== 'to_compute' && qrCodeLessVideoStatus !== 'to_compute') {
              
        console.log('⏭️ Aucun champ en attente de calcul, webhook ignoré:', {
          table,
          recordId: record.id,
          qrCodeVideoStatus,
          qrCodeLessVideoStatus
        });
        console.log("record => ", JSON.stringify(record, null, 2));

        res.status(200).json({
          success: true,
          message: 'Vidéos générées ou en cours de génération'
        });
        return;
      }

      // Vérifier que le record contient une vidéo de présentation
      if (!record?.presentation_video_public_url) {
        console.log('⚠️ Aucune vidéo de présentation trouvée mais champs QR code en to_compute, passage à null');
        
        // Mettre à jour les champs QR code vers null
        const updates: any = {};
        if (qrCodeVideoStatus === 'to_compute') {
          updates['qr_code_presentation_video_public_url'] = null;
        }
        if (qrCodeLessVideoStatus === 'to_compute') {
          updates['qr_code_less_presentation_video_public_url'] = null;
        }

        // Mettre à jour la base de données via le service
        const updateSuccess = await this.supabaseService.updateRecord(table, record.id, updates);

        if (!updateSuccess) {
          res.status(500).json({
            success: false,
            error: 'Erreur lors de la mise à jour des champs QR code'
          });
          return;
        }
        res.status(200).json({
          success: true,
          message: 'Champs QR code mis à jour vers null (pas de vidéo de présentation)',
          updates
        });
        return;
      }
      
      // Si au moins un champ est en 'to_compute', continuer le traitement
      console.log('🔄 Champs en attente de calcul détectés:', {
        table,
        recordId: record.id,
        qrCodeVideoStatus,
        qrCodeLessVideoStatus
      });

      // Utiliser la vidéo avec son complet
      const prefixVideoWithFullSound = 'qr_codes/qr_code_scene_start_and_sound.mp4';

      // Construire l'URL de la vidéo postfix depuis Supabase
      // Utiliser default_presentation_video_public_url si presentation_video_public_url n'est pas renseignée
      const postfixVideoUrl = record.presentation_video_public_url || record.default_presentation_video_public_url;

      console.log('🎬 Préparation de la fusion avec son complet:', {
        table,
        recordId: record.id,
        prefixVideoWithFullSound,
        postfixVideoUrl,
        videoDuration: 16, // 16 secondes de contenu
        qrCodeLessStart: 6  // QR Code Less commence à 6s
      });

      const mergeRequest: MergeWithFullSoundRequest = {
        type: 'fullsound',
        prefixVideoWithFullSound,
        postfixVideoUrl,
        videoDuration: 16, // 16 secondes de contenu dans la vidéo prefix
        qrCodeLessStart: 6, // QR Code Less commence à 6 secondes
        quality: 'high', // Qualité par défaut
        fps: 30, // FPS par défaut
        metadata: {
          table,
          recordId: record.id,
          operation: type
        }
      };

      // Créer un job Cloud Run pour le traitement en arrière-plan
      const jobPayload: JobPayload = {
        mergeRequest,
        table,
        recordId: record.id
      };

      const jobName = await this.cloudRunJobsService.createVideoProcessingJob(jobPayload);

      // Retourner immédiatement pour indiquer que le webhook est accepté
      res.status(200).json({
        success: true,
        message: 'Webhook accepté, job de fusion créé',
        jobName,
        metadata: {
          table,
          recordId: record.id,
          operation: type
        }
      });

    } catch (error) {
      console.error('❌ Erreur lors du traitement du webhook:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur interne du serveur'
      });
    }
  }

  async getJobStatus(req: Request, res: Response): Promise<void> {
    try {
      const { executionName } = req.params;

      if (!executionName) {
        res.status(400).json({
          success: false,
          error: 'Nom de l\'exécution requis'
        });
        return;
      }

      const jobStatus = await this.cloudRunJobsService.checkJobStatus(executionName);

      res.json({
        success: true,
        job: jobStatus
      });

    } catch (error) {
      console.error('❌ Erreur lors de la récupération du statut:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur interne du serveur'
      });
    }
  }

  async getHealth(_req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      message: 'Service vidéo opérationnel',
      timestamp: new Date().toISOString()
    });
  }
} 