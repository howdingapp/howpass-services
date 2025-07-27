import { Request, Response } from 'express';
import { VideoService, MergeRequest } from '../services/VideoService';
import { SupabaseService } from '../services/SupabaseService';

interface DatabaseWebhookPayload {
  type: string;
  table: string;
  record: any;
  old_record?: any;
}

export class VideoController {
  private videoService: VideoService;
  private supabaseService: SupabaseService;

  constructor() {
    this.videoService = new VideoService();
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

      // Retourner immédiatement pour indiquer que le webhook est accepté
      res.status(200).json({
        success: true,
        message: 'Webhook accepté, fusion en cours',
        metadata: {
          table,
          recordId: record.id,
          operation: type
        }
      });

      // Lancer le merge en arrière-plan
      this.processMergeInBackground(mergeRequest, table, record.id);

    } catch (error) {
      console.error('❌ Erreur lors du traitement du webhook:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur interne du serveur'
      });
    }
  }

  private async processMergeInBackground(mergeRequest: MergeRequest, table: string, recordId: string | number): Promise<void> {
    try {
      console.log('🔄 Démarrage du merge en arrière-plan pour:', { table, recordId });

      const result = await this.videoService.mergeVideos(mergeRequest);

      if (result.success && result.outputUrl) {
        console.log('✅ Merge terminé avec succès pour:', { table, recordId, jobId: result.jobId });

        // Construire le chemin de destination dans le bucket
        const bucketName = process.env['SUPABASE_BUCKET_NAME'];
        if (!bucketName) {
          console.error('❌ Variable d\'environnement SUPABASE_BUCKET_NAME non définie');
          return;
        }

        const destinationPath = `${table}/${recordId}.mp4`;
        console.log('📤 Upload vers Supabase:', { bucketName, destinationPath });

        // Uploader le fichier fusionné vers Supabase
        await this.videoService.uploadToSupabase(result.outputUrl, bucketName, destinationPath);

        console.log('✅ Upload vers Supabase terminé pour:', { table, recordId, destinationPath });

      } else {
        console.error('❌ Échec du merge pour:', { table, recordId, error: result.error });
      }

    } catch (error) {
      console.error('❌ Erreur lors du traitement en arrière-plan:', error);
    }
  }

  async getJobStatus(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;

      if (!jobId) {
        res.status(400).json({
          success: false,
          error: 'ID du job requis'
        });
        return;
      }

      const jobStatus = await this.videoService.getJobStatus(jobId);

      if (!jobStatus) {
        res.status(404).json({
          success: false,
          error: 'Job non trouvé'
        });
        return;
      }

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