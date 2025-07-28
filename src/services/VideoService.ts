import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseService, VIDEO_BUCKET, SOUND_BUCKET } from './SupabaseService';

export interface MergeRequest {
  prefixVideo1BucketPath: string; // Première vidéo préfixe (qr_code_scene1_part1.mp4)
  prefixVideo2BucketPath: string; // Deuxième vidéo préfixe (qr_code_scene1_part2.mp4)
  postfixVideoUrl: string; // Vidéo fournie par le webhook
  audioBucketPath?: string; // Son optionnel (ytmp3free.cc_playa-blanca-dream-youtubemp3free.org.mp3)
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
  prefixVideo1Path: string; // Chemin vers la première vidéo préfixe
  prefixVideo2Path: string; // Chemin vers la deuxième vidéo préfixe
  postfixPath: string; // Chemin vers la vidéo postfixe
  audioPath?: string; // Chemin vers le fichier audio
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
      const ffmpeg = spawn('ffmpeg', ['-i', filePath, '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams']);
      let output = '';
      ffmpeg.stdout.on('data', (data) => {
        output += data.toString();
      });
      ffmpeg.stderr.on('data', (data) => {
        console.error(`ffmpeg stderr: ${data}`);
      });
      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg error code: ${code}`));
          return;
        }
        try {
          const metadata = JSON.parse(output);
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
        } catch (error) {
          reject(new Error(`Erreur lors de l'analyse de la vidéo: ${error instanceof Error ? error.message : 'Erreur inconnue'}`));
        }
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
      console.log(`📹 Prefix Video 1: ${request.prefixVideo1BucketPath}`);
      console.log(`📹 Prefix Video 2: ${request.prefixVideo2BucketPath}`);
      console.log(`📹 Postfix: ${request.postfixVideoUrl}`);
      if (request.audioBucketPath) {
        console.log(`🎵 Audio: ${request.audioBucketPath}`);
      }

      // Générer les chemins locaux
      const prefixVideo1Path = path.join(this.tempPath, `prefix1_${jobId}.mp4`);
      const prefixVideo2Path = path.join(this.tempPath, `prefix2_${jobId}.mp4`);
      const postfixPath = path.join(this.tempPath, `postfix_${jobId}.mp4`);
      const audioPath = request.audioBucketPath ? path.join(this.tempPath, `audio_${jobId}.mp3`) : undefined;
      const outputPath = path.join(this.tempPath, `merged_${jobId}.mp4`);

      // Mettre à jour le statut
      job.status = 'processing';
      job.progress = 10;
      job.updatedAt = new Date();

      // Télécharger l'audio si fourni
      if (request.audioBucketPath && audioPath) {
        console.log('🎵 Téléchargement de l\'audio...');
        await this.supabaseService.download(SOUND_BUCKET, request.audioBucketPath, audioPath);
        job.progress = 50;
        job.updatedAt = new Date();
      }

      // Télécharger les vidéos depuis Supabase
      console.log('📥 Téléchargement des vidéos...');
      await this.supabaseService.download(VIDEO_BUCKET, request.prefixVideo1BucketPath, prefixVideo1Path);
      job.progress = 20;
      job.updatedAt = new Date();

      await this.supabaseService.download(VIDEO_BUCKET, request.prefixVideo2BucketPath, prefixVideo2Path);
      job.progress = 30;
      job.updatedAt = new Date();

      // Extraire le chemin du fichier depuis l'URL publique
      const urlParts = request.postfixVideoUrl.split('/');
      const filePath = urlParts.slice(-2).join('/'); // Prend les 2 derniers segments
      
      await this.supabaseService.download(VIDEO_BUCKET, filePath, postfixPath);
      job.progress = 40;
      job.updatedAt = new Date();

      // Analyser les dimensions des vidéos et adapter la vidéo postfixe
      console.log('📐 Analyse des dimensions des vidéos...');
      const targetDimensions = await this.getTargetDimensions(prefixVideo1Path);
      const adaptedPostfixPath = await this.adaptVideoDimensions(postfixPath, targetDimensions, jobId);
      
      job.progress = 45;
      job.updatedAt = new Date();

      // Préparer les options FFmpeg
      const ffmpegOptions: FFmpegOptions = {
        prefixVideo1Path,
        prefixVideo2Path,
        postfixPath: adaptedPostfixPath, // Utiliser la vidéo adaptée
        outputPath,
        quality: request.quality || undefined,
        resolution: request.resolution || undefined,
        fps: request.fps || undefined,
        audioCodec: request.audioCodec || undefined,
        videoCodec: request.videoCodec || undefined,
        threads: parseInt(process.env['FFMPEG_THREADS'] || '4'),
        timeout: parseInt(process.env['FFMPEG_TIMEOUT'] || '300000')
      };

      // Ajouter l'audio si disponible
      if (audioPath) {
        ffmpegOptions.audioPath = audioPath;
      }

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
      const outputUrl = await this.supabaseService.upload(VIDEO_BUCKET, outputPath, fileName);
      job.progress = 95;
      job.updatedAt = new Date();

      // Nettoyer les fichiers temporaires
      const tempFiles = [prefixVideo1Path, prefixVideo2Path, postfixPath, outputPath];
      if (audioPath) {
        tempFiles.push(audioPath);
      }
      if (adaptedPostfixPath !== postfixPath) {
        tempFiles.push(adaptedPostfixPath);
      }
      await this.cleanupTempFiles(tempFiles);

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

      const args = [
        '-i', options.prefixVideo1Path,
        '-i', options.prefixVideo2Path,
        '-i', options.postfixPath
      ];

      // Ajouter l'audio si disponible
      if (options.audioPath) {
        args.push('-i', options.audioPath);
      }

      args.push(
        '-filter_complex',
        this.buildFilterComplex(options)
      );

      // Mapping différent selon la présence d'audio
      if (options.audioPath) {
        args.push(
          '-map', '[outv]',
          '-map', '3:a', // Utiliser directement l'audio externe
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-r', (options.fps || 25).toString(),
          '-crf', options.quality === 'low' ? '28' : options.quality === 'medium' ? '23' : '18',
          '-threads', (options.threads || 4).toString(),
          '-y',
          options.outputPath
        );
      } else {
        args.push(
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-r', (options.fps || 25).toString(),
          '-crf', options.quality === 'low' ? '28' : options.quality === 'medium' ? '23' : '18',
          '-threads', (options.threads || 4).toString(),
          '-y',
          options.outputPath
        );
      }

      const ffmpeg = spawn('ffmpeg', args);

      let progressOutput = '';
      ffmpeg.stdout.on('data', (data) => {
        progressOutput += data.toString();
        const job = this.jobs.get(jobId);
        if (job) {
          const percentMatch = progressOutput.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2}) bitrate=(\d+)/);
          if (percentMatch) {
            const currentTime = percentMatch[1];
            const durationMatch = progressOutput.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);
            const duration = durationMatch ? durationMatch[1] : '00:00:00.00';
            const durationSeconds = this.parseDuration(duration!);
            const currentTimeSeconds = this.parseDuration(currentTime!);
            const progress = (currentTimeSeconds / durationSeconds) * 100;
            job.progress = Math.round(progress);
            job.updatedAt = new Date();
          }
        }
        console.log(`📊 Progression FFmpeg: ${progressOutput}`);
      });

      ffmpeg.stderr.on('data', (data) => {
        console.error(`ffmpeg stderr: ${data}`);
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg error code: ${code}`));
          return;
        }
        console.log('✅ Fusion FFmpeg terminée');
        resolve();
      });

      ffmpeg.on('error', (err) => {
        console.error('❌ Erreur FFmpeg:', err);
        reject(new Error(`Erreur FFmpeg: ${err.message}`));
      });

      if (options.timeout) {
        setTimeout(() => {
          ffmpeg.kill('SIGKILL');
          reject(new Error(`Timeout FFmpeg pour le job ${jobId}`));
        }, options.timeout);
      }
    });
  }

  private buildFilterComplex(options: FFmpegOptions): string {
    if (options.audioPath) {
      // Avec audio : concaténer les vidéos, puis utiliser l'audio externe
      return '[0:v][1:v][2:v]concat=n=3:v=1:a=0[outv]';
    } else {
      // Sans audio : concaténer les 3 vidéos avec leur audio
      return '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]';
    }
  }

  private parseDuration(durationString: string): number {
    const parts = durationString.split(':');
    const hours = parseInt(parts[0]!);
    const minutes = parseInt(parts[1]!);
    const seconds = parseFloat(parts[2]!);
    return hours * 3600 + minutes * 60 + seconds;
  }

  private async getTargetDimensions(videoPath: string): Promise<{ width: number; height: number }> {
    try {
      const videoInfo = await this.getVideoInfo(videoPath);
      return {
        width: videoInfo.width,
        height: videoInfo.height
      };
    } catch (error) {
      console.error('❌ Erreur lors de l\'analyse des dimensions:', error);
      // Dimensions par défaut si l'analyse échoue
      return { width: 1920, height: 1080 };
    }
  }

  private async adaptVideoDimensions(
    videoPath: string, 
    targetDimensions: { width: number; height: number }, 
    jobId: string
  ): Promise<string> {
    try {
      console.log(`📐 Adaptation des dimensions: ${targetDimensions.width}x${targetDimensions.height}`);
      
      const videoInfo = await this.getVideoInfo(videoPath);
      const currentWidth = videoInfo.width;
      const currentHeight = videoInfo.height;
      
      // Vérifier si l'adaptation est nécessaire
      if (currentWidth === targetDimensions.width && currentHeight === targetDimensions.height) {
        console.log('✅ Dimensions déjà compatibles, pas d\'adaptation nécessaire');
        return videoPath;
      }
      
      const adaptedPath = path.join(this.tempPath, `adapted_postfix_${jobId}.mp4`);
      
      return new Promise((resolve, reject) => {
        const args = [
          '-i', videoPath,
          '-filter_complex', this.buildAdaptationFilter(currentWidth, currentHeight, targetDimensions),
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-crf', '18',
          '-preset', 'medium',
          '-y',
          adaptedPath
        ];
        
        const ffmpeg = spawn('ffmpeg', args);
        
        ffmpeg.stderr.on('data', (data) => {
          console.log(`📐 Adaptation FFmpeg: ${data}`);
        });
        
        ffmpeg.on('close', (code) => {
          if (code !== 0) {
            console.error(`❌ Erreur lors de l'adaptation des dimensions: code ${code}`);
            reject(new Error(`Erreur FFmpeg lors de l'adaptation: ${code}`));
            return;
          }
          console.log('✅ Adaptation des dimensions terminée');
          resolve(adaptedPath);
        });
        
        ffmpeg.on('error', (err) => {
          console.error('❌ Erreur FFmpeg lors de l\'adaptation:', err);
          reject(new Error(`Erreur FFmpeg: ${err.message}`));
        });
      });
      
    } catch (error) {
      console.error('❌ Erreur lors de l\'adaptation des dimensions:', error);
      // En cas d'erreur, retourner le chemin original
      return videoPath;
    }
  }

  private buildAdaptationFilter(
    currentWidth: number, 
    currentHeight: number, 
    targetDimensions: { width: number; height: number }
  ): string {
    const { width: targetWidth, height: targetHeight } = targetDimensions;
    
    // Calculer le ratio d'aspect
    const currentRatio = currentWidth / currentHeight;
    const targetRatio = targetWidth / targetHeight;
    
    if (currentRatio > targetRatio) {
      // Vidéo plus large que la cible - redimensionner et ajouter du padding vertical
      return `scale=${targetWidth}:-2,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
    } else if (currentRatio < targetRatio) {
      // Vidéo plus haute que la cible - redimensionner et ajouter du padding horizontal
      return `scale=-2:${targetHeight},pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
    } else {
      // Même ratio - redimensionner simplement
      return `scale=${targetWidth}:${targetHeight},setsar=1`;
    }
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    return this.jobs.get(jobId) || null;
  }

  async cleanupJob(jobId: string): Promise<void> {
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

  async uploadToSupabase(localFilePath: string, bucketName: string, destinationPath: string): Promise<void> {
    try {
      console.log('📤 Début de l\'upload vers Supabase:', { localFilePath, bucketName, destinationPath });

      // Vérifier que le fichier local existe
      if (!await fs.pathExists(localFilePath)) {
        throw new Error(`Fichier local non trouvé: ${localFilePath}`);
      }

      // Uploader le fichier vers Supabase
      await this.supabaseService.upload(VIDEO_BUCKET,localFilePath, destinationPath);

      console.log('✅ Upload vers Supabase terminé:', { destinationPath });

    } catch (error) {
      console.error('❌ Erreur lors de l\'upload vers Supabase:', error);
      throw error;
    }
  }
} 