import { Request, Response } from 'express';
import { VideoService, MergeRequest } from '../services/VideoService';

export class VideoController {
  private videoService: VideoService;

  constructor() {
    this.videoService = new VideoService();
  }

  async mergeVideos(req: Request, res: Response): Promise<void> {
    try {
      const { prefixVideoUrl, postfixVideoUrl, quality, resolution, fps, audioCodec, videoCodec } = req.body;

      // Validation des paramètres requis
      if (!prefixVideoUrl || !postfixVideoUrl) {
        res.status(400).json({
          success: false,
          error: 'Les URLs des vidéos prefix et postfix sont requises'
        });
        return;
      }

      // Validation des URLs
      if (!this.isValidUrl(prefixVideoUrl) || !this.isValidUrl(postfixVideoUrl)) {
        res.status(400).json({
          success: false,
          error: 'Les URLs fournies ne sont pas valides'
        });
        return;
      }

      // Validation de la qualité
      if (quality && !['low', 'medium', 'high'].includes(quality)) {
        res.status(400).json({
          success: false,
          error: 'La qualité doit être "low", "medium" ou "high"'
        });
        return;
      }

      // Validation de la résolution
      if (resolution && !this.isValidResolution(resolution)) {
        res.status(400).json({
          success: false,
          error: 'Format de résolution invalide. Utilisez le format "largeurxhauteur" (ex: 1920x1080)'
        });
        return;
      }

      // Validation du FPS
      if (fps && (typeof fps !== 'number' || fps <= 0 || fps > 120)) {
        res.status(400).json({
          success: false,
          error: 'Le FPS doit être un nombre entre 1 et 120'
        });
        return;
      }

      const mergeRequest: MergeRequest = {
        prefixVideoUrl,
        postfixVideoUrl,
        quality,
        resolution,
        fps,
        audioCodec,
        videoCodec
      };

      console.log('🎬 Demande de fusion reçue:', {
        prefixVideoUrl,
        postfixVideoUrl,
        quality,
        resolution,
        fps
      });

      const result = await this.videoService.mergeVideos(mergeRequest);

      if (result.success) {
        res.json({
          success: true,
          jobId: result.jobId,
          outputUrl: result.outputUrl,
          message: 'Fusion démarrée avec succès'
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          jobId: result.jobId
        });
      }

    } catch (error) {
      console.error('❌ Erreur lors de la fusion:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur interne du serveur'
      });
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

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidResolution(resolution: string): boolean {
    const resolutionRegex = /^\d+x\d+$/;
    return resolutionRegex.test(resolution);
  }
} 