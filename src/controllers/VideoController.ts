import { Request, Response } from 'express';
import { MergeRequest } from '../services/VideoService';
import { CloudRunJobsService, JobPayload } from '../services/CloudRunJobsService';

interface DatabaseWebhookPayload {
  type: string;
  table: string;
  record: any;
  old_record?: any;
}

export class VideoController {
  private cloudRunJobsService: CloudRunJobsService;

  constructor() {
    this.cloudRunJobsService = new CloudRunJobsService();
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

      // Vérifier que le record contient une vidéo de présentation
      if (!record?.presentation_video_public_url) {
        console.log('⏭️ Aucune vidéo de présentation trouvée dans le record');
        res.status(200).json({
          success: true,
          message: 'Aucune vidéo de présentation trouvée'
        });
        return;
      }

      // Obtenir les URLs publiques des vidéos préfixes et de l'audio via le service Supabase
      const prefixVideo1BucketPath = 'qr_codes/qr_code_scene1_part1.mp4';
      const prefixVideo2BucketPath = 'qr_codes/qr_code_scene1_part2.mp4';
      const audioBucketPath = 'ytmp3free.cc_playa-blanca-dream-youtubemp3free.org.mp3';

      // Construire l'URL de la vidéo postfix depuis Supabase
      const postfixVideoUrl = record.presentation_video_public_url;

      console.log('🎬 Préparation de la fusion:', {
        table,
        recordId: record.id,
        prefixVideo1BucketPath,
        prefixVideo2BucketPath,
        postfixVideoUrl,
        audioBucketPath,
      });

      const mergeRequest: MergeRequest = {
        prefixVideo1BucketPath,
        prefixVideo2BucketPath,
        postfixVideoUrl,
        audioBucketPath,
        quality: 'medium', // Qualité par défaut
        resolution: '1920x1080', // Résolution par défaut
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