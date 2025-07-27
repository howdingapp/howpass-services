import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseService } from './SupabaseService';

export interface MergeRequest {
  prefixVideoUrl: string;
  postfixVideoUrl: string;
  quality?: 'low' | 'medium' | 'high';
  resolution?: string;
  fps?: number;
  audioCodec?: string;
  videoCodec?: string;
  metadata?: {
    table?: string;
    recordId?: string | number;
    operation?: string;
    [key: string]: any;
  };
}

export interface MergeResponse {
  success: boolean;
  outputUrl?: string;
  error?: string;
  jobId: string;
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  outputUrl?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FFmpegOptions {
  prefixPath: string;
  postfixPath: string;
  outputPath: string;
  quality?: string | undefined;
  resolution?: string | undefined;
  fps?: number | undefined;
  audioCodec?: string | undefined;
  videoCodec?: string | undefined;
  threads?: number;
  timeout?: number;
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  audioCodec?: string;
  videoCodec?: string;
  format: string;
}

export class VideoService {
  private tempPath: string;
  private jobs: Map<string, JobStatus> = new Map();
  private supabaseService: SupabaseService;

  constructor() {
    this.tempPath = process.env['TEMP_PATH'] || './temp';
    this.supabaseService = new SupabaseService();
    
    // Créer les répertoires s'ils n'existent pas
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    fs.ensureDirSync(this.tempPath);
  }

  async getVideoInfo(filePath: string): Promise<VideoInfo> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
        if (err) {
          reject(new Error(`Erreur lors de l'analyse de la vidéo: ${err.message}`));
          return;
        }

        const videoStream = metadata.streams.find((stream: any) => stream.codec_type === 'video');
        const audioStream = metadata.streams.find((stream: any) => stream.codec_type === 'audio');

        if (!videoStream) {
          reject(new Error('Aucun flux vidéo trouvé'));
          return;
        }

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps: this.parseFPS(videoStream.r_frame_rate || '0/1'),
          bitrate: metadata.format.bit_rate ? parseInt(metadata.format.bit_rate) : 0,
          audioCodec: audioStream?.codec_name,
          videoCodec: videoStream.codec_name,
          format: metadata.format.format_name || 'unknown'
        });
      });
    });
  }

  private parseFPS(fpsString: string): number {
    const parts = fpsString.split('/');
    const num = parts[0] ? parseInt(parts[0]) : 0;
    const den = parts[1] ? parseInt(parts[1]) : 1;
    return den ? num / den : 0;
  }

  async mergeVideos(request: MergeRequest): Promise<MergeResponse> {
    const jobId = uuidv4();
    
    // Créer le job
    const job: JobStatus = {
      id: jobId,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.jobs.set(jobId, job);

    try {
      console.log(`🎬 Début du job de fusion ${jobId}`);
      console.log(`📹 Prefix: ${request.prefixVideoUrl}`);
      console.log(`📹 Postfix: ${request.postfixVideoUrl}`);

      // Générer les chemins locaux
      const prefixPath = path.join(this.tempPath, `prefix_${jobId}.mp4`);
      const postfixPath = path.join(this.tempPath, `postfix_${jobId}.mp4`);
      const outputPath = path.join(this.tempPath, `merged_${jobId}.mp4`);

      // Mettre à jour le statut
      job.status = 'processing';
      job.progress = 10;
      job.updatedAt = new Date();

      // Télécharger les vidéos depuis Supabase
      console.log('📥 Téléchargement des vidéos...');
      await this.supabaseService.downloadVideo(request.prefixVideoUrl, prefixPath);
      job.progress = 30;
      job.updatedAt = new Date();

      await this.supabaseService.downloadVideo(request.postfixVideoUrl, postfixPath);
      job.progress = 50;
      job.updatedAt = new Date();

      // Préparer les options FFmpeg
      const ffmpegOptions: FFmpegOptions = {
        prefixPath,
        postfixPath,
        outputPath,
        quality: request.quality || undefined,
        resolution: request.resolution || undefined,
        fps: request.fps || undefined,
        audioCodec: request.audioCodec || undefined,
        videoCodec: request.videoCodec || undefined,
        threads: parseInt(process.env['FFMPEG_THREADS'] || '4'),
        timeout: parseInt(process.env['FFMPEG_TIMEOUT'] || '300000')
      };

      // Exécuter la fusion
      console.log('🎬 Fusion des vidéos...');
      await this.executeMerge(ffmpegOptions, jobId);
      job.progress = 80;
      job.updatedAt = new Date();

      // Vérifier que le fichier de sortie existe
      if (!await fs.pathExists(outputPath)) {
        throw new Error('Le fichier de sortie n\'a pas été créé');
      }

      // Upload du résultat vers Supabase
      console.log('📤 Upload du résultat...');
      const fileName = this.supabaseService.generateFileName('merged');
      const outputUrl = await this.supabaseService.uploadVideo(outputPath, fileName);
      job.progress = 95;
      job.updatedAt = new Date();

      // Nettoyer les fichiers temporaires
      await this.cleanupTempFiles([prefixPath, postfixPath, outputPath]);

      // Mettre à jour le job
      job.status = 'completed';
      job.progress = 100;
      job.outputUrl = outputUrl;
      job.updatedAt = new Date();

      console.log(`✅ Fusion terminée avec succès: ${outputUrl}`);

      return {
        success: true,
        outputUrl,
        jobId
      };

    } catch (error) {
      // Mettre à jour le job en cas d'erreur
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Erreur inconnue';
      job.updatedAt = new Date();

      console.error(`❌ Erreur lors de la fusion:`, error);

      // Nettoyer les fichiers temporaires en cas d'erreur
      await this.cleanupTempFiles([
        path.join(this.tempPath, `prefix_${jobId}.mp4`),
        path.join(this.tempPath, `postfix_${jobId}.mp4`),
        path.join(this.tempPath, `merged_${jobId}.mp4`)
      ]);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        jobId
      };
    }
  }

  private executeMerge(options: FFmpegOptions, jobId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🎬 Début de la fusion FFmpeg...');

      let command = ffmpeg();

      // Ajouter les fichiers d'entrée
      command = command.input(options.prefixPath);
      command = command.input(options.postfixPath);

      // Configurer la sortie avec concat
      command
        .outputOptions([
          '-filter_complex', '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]',
          '-map', '[outv]',
          '-map', '[outa]'
        ])
        .output(options.outputPath);

      // Ajouter les options de qualité
      if (options.quality) {
        switch (options.quality) {
          case 'low':
            command.outputOptions(['-crf', '28']);
            break;
          case 'medium':
            command.outputOptions(['-crf', '23']);
            break;
          case 'high':
            command.outputOptions(['-crf', '18']);
            break;
        }
      }

      // Ajouter les options de résolution
      if (options.resolution) {
        command.outputOptions(['-vf', `scale=${options.resolution}`]);
      }

      // Ajouter les options de FPS
      if (options.fps) {
        command.outputOptions(['-r', options.fps.toString()]);
      }

      // Ajouter les codecs
      if (options.videoCodec) {
        command.outputOptions(['-c:v', options.videoCodec]);
      }
      if (options.audioCodec) {
        command.outputOptions(['-c:a', options.audioCodec]);
      }

      // Configurer les threads
      if (options.threads) {
        command.outputOptions(['-threads', options.threads.toString()]);
      }

      // Gérer le timeout
      if (options.timeout) {
        command.timeout(options.timeout);
      }

      // Gérer les événements
      command
        .on('progress', (progress: any) => {
          const job = this.jobs.get(jobId);
          if (job) {
            // Ajuster la progression entre 50% et 80%
            const baseProgress = 50;
            const ffmpegProgress = Math.round(progress.percent || 0);
            job.progress = baseProgress + Math.round((ffmpegProgress * 30) / 100);
            job.updatedAt = new Date();
          }
          console.log(`📊 Progression FFmpeg: ${progress.percent?.toFixed(1)}%`);
        })
        .on('end', () => {
          console.log('✅ Fusion FFmpeg terminée');
          resolve();
        })
        .on('error', (err: any) => {
          console.error('❌ Erreur FFmpeg:', err.message);
          reject(new Error(`Erreur FFmpeg: ${err.message}`));
        })
        .on('stderr', (stderrLine: any) => {
          console.log('FFmpeg stderr:', stderrLine);
        });

      // Démarrer la commande
      command.run();
    });
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    return this.jobs.get(jobId) || null;
  }

  async cleanupJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job?.outputUrl) {
      try {
        // Extraire le nom du fichier de l'URL
        const urlParts = job.outputUrl.split('/');
        const fileName = urlParts[urlParts.length - 1];
        if (fileName) {
          await this.supabaseService.deleteVideo(fileName);
        }
      } catch (error) {
        console.error(`Erreur lors du nettoyage du fichier Supabase:`, error);
      }
    }
    this.jobs.delete(jobId);
  }

  private async cleanupTempFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      await this.supabaseService.cleanupLocalFile(filePath);
    }
  }

  async cleanupOldFiles(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    
    // Nettoyer les jobs anciens
    for (const [jobId, job] of this.jobs.entries()) {
      if (now - job.updatedAt.getTime() > maxAge) {
        await this.cleanupJob(jobId);
      }
    }

    // Nettoyer les fichiers temporaires
    try {
      const tempFiles = await fs.readdir(this.tempPath);
      for (const file of tempFiles) {
        const filePath = path.join(this.tempPath, file);
        const stats = await fs.stat(filePath);
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.remove(filePath);
        }
      }
    } catch (error) {
      console.error('Erreur lors du nettoyage des fichiers temporaires:', error);
    }
  }
} 