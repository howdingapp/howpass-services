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
  prefix1Duration?: number; // Durée du prefix1 pour synchroniser l'audio
  metadata?: {
    table?: string;
    recordId?: string | number;
    operation?: string;
    [key: string]: any;
  };
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
      const ffmpeg = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ]);
      
      let output = '';
      let errorOutput = '';
      
      ffmpeg.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          console.error(`ffprobe error code: ${code}`);
          console.error(`ffprobe stderr: ${errorOutput}`);
          reject(new Error(`ffprobe error code: ${code}`));
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
            duration: parseFloat(metadata.format.duration) || 0,
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
      
      ffmpeg.on('error', (err) => {
        console.error('❌ Erreur ffprobe:', err);
        reject(new Error(`Erreur ffprobe: ${err.message}`));
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

      // Traiter les champs de présentation
      console.log('🎬 Traitement des champs de présentation');
      return await this.processVideoFields(request, jobId);
    } catch (error) {
      console.error('❌ Erreur lors du traitement vidéo:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        jobId
      };
    }
  }

  private executeTwoStepMerge(options: FFmpegOptions, jobId: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('🎬 Début de la fusion en deux étapes...');

        // Étape 1 : Créer prefix2+postfix+audio
        const intermediatePath = path.join(this.tempPath, `intermediate_${jobId}.mp4`);
        
        console.log('📹 Étape 1 : Création de prefix2+postfix+audio...');
        await this.createIntermediateVideo(options.prefixVideo2Path, options.postfixPath, options.audioPath!, intermediatePath, options);

        // Sauvegarder la vidéo intermédiaire dans le bucket
        const table = options.metadata?.table || 'practices';
        const recordId = options.metadata?.recordId || jobId;
        const midDateSuffix = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // Format: YYYYMMDD
        const midDestinationPath = `${table}/${recordId}_mid_${midDateSuffix}.mp4`;
        
        console.log('📤 Upload de la vidéo intermédiaire vers Supabase:', { midDestinationPath });
        const midVideoOutputUrl = await this.supabaseService.upload(VIDEO_BUCKET, intermediatePath, midDestinationPath);
        
        // Mettre à jour le champ qr_code_less_presentation_video_public_url dans Supabase
        await this.supabaseService.updateQrCodePresentationVideoMidUrl(table, recordId, midVideoOutputUrl);
        console.log('✅ Vidéo intermédiaire sauvegardée et associée dans Supabase');

        // Étape 2 : Concaténer prefix1 + vidéo intermédiaire
        console.log('📹 Étape 2 : Concaténation prefix1 + vidéo intermédiaire...');
        await this.concatWithPrefix1(options.prefixVideo1Path, intermediatePath, options.outputPath, options);

        // Upload de la vidéo finale vers Supabase
        console.log('📤 Upload de la vidéo finale...');
        const finalDateSuffix = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // Format: YYYYMMDD
        const destinationPath = `${table}/${recordId}_merged_${finalDateSuffix}.mp4`;
        const mergedVideoOutputUrl = await this.supabaseService.upload(VIDEO_BUCKET, options.outputPath, destinationPath);

        // Mettre à jour le champ qr_code_presentation_video_public_url dans la base de données
        console.log('📝 Mise à jour du champ qr_code_presentation_video_public_url...');
        const updateSuccess = await this.supabaseService.updateQrCodePresentationVideoUrl(table, recordId, mergedVideoOutputUrl);
        
        if (!updateSuccess) {
          console.error('❌ Échec de la mise à jour du champ qr_code_presentation_video_public_url pour:', { table, recordId });
          throw new Error('Échec de la mise à jour de la base de données');
        }

        console.log('✅ Champ qr_code_presentation_video_public_url mis à jour avec succès');
        console.log('✅ Fusion en deux étapes terminée avec succès');
        resolve();
      } catch (error) {
        console.error('❌ Erreur lors de la fusion en deux étapes:', error);
        reject(error);
      }
    });
  }

  private createIntermediateVideo(prefix2Path: string, postfixPath: string, audioPath: string, outputPath: string, options: FFmpegOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🎬 Création de la vidéo intermédiaire...');

      const args = [
        '-i', prefix2Path,        // vidéo 1
        '-i', postfixPath,        // vidéo 2
        '-i', audioPath,          // musique
        '-filter_complex',
          '[0:v][1:v]concat=n=2:v=1:a=0[concatv];' +
          '[2:a]atrim=duration=30,asetpts=PTS-STARTPTS[trima]',
        '-map', '[concatv]',
        '-map', '[trima]',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-r', (options.fps || 25).toString(),
        '-crf', options.quality === 'low' ? '28' : options.quality === 'medium' ? '23' : '18',
        '-threads', (options.threads || 4).toString(),
        '-t', '30', // ← force durée finale à 30s
        '-y',
        outputPath
      ];


      console.log('🎬 Arguments FFmpeg (intermédiaire):', args.join(' '));

      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log(`🎬 FFmpeg (intermédiaire): ${data}`);
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          console.error(`❌ Erreur FFmpeg (intermédiaire): code ${code}`);
          console.error(`❌ FFmpeg stderr: ${stderr}`);
          reject(new Error(`ffmpeg error code: ${code}`));
          return;
        }
        console.log('✅ Vidéo intermédiaire créée avec succès');
        resolve();
      });

      ffmpeg.on('error', (err) => {
        console.error('❌ Erreur lors de la création de la vidéo intermédiaire:', err);
        reject(new Error(`Erreur FFmpeg: ${err.message}`));
      });

      if (options.timeout) {
        setTimeout(() => {
          ffmpeg.kill('SIGKILL');
          reject(new Error('Timeout lors de la création de la vidéo intermédiaire'));
        }, options.timeout);
      }
    });
  }

  private concatWithPrefix1(prefix1Path: string, intermediatePath: string, outputPath: string, options: FFmpegOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🎬 Concaténation avec prefix1...');

      const args = [
        '-i', prefix1Path,
        '-i', intermediatePath,
        '-filter_complex', '[0:v:0][0:a:0][1:v:0][1:a:0]concat=n=2:v=1:a=1[outv][outa]',
        '-map', '[outv]',
        '-map', '[outa]',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-r', (options.fps || 25).toString(),
        '-crf', options.quality === 'low' ? '28' : options.quality === 'medium' ? '23' : '18',
        '-threads', (options.threads || 4).toString(),
        '-y',
        outputPath
      ];

      console.log('🎬 Arguments FFmpeg (final):', args.join(' '));

      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log(`🎬 FFmpeg (final): ${data}`);
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          console.error(`❌ Erreur FFmpeg (final): code ${code}`);
          console.error(`❌ FFmpeg stderr: ${stderr}`);
          reject(new Error(`ffmpeg error code: ${code}`));
          return;
        }
        console.log('✅ Concaténation finale terminée avec succès');
        resolve();
      });

      ffmpeg.on('error', (err) => {
        console.error('❌ Erreur lors de la concaténation finale:', err);
        reject(new Error(`Erreur FFmpeg: ${err.message}`));
      });

      if (options.timeout) {
        setTimeout(() => {
          ffmpeg.kill('SIGKILL');
          reject(new Error('Timeout lors de la concaténation finale'));
        }, options.timeout);
      }
    });
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
      // Dimensions par défaut adaptées aux téléphones (mode portrait)
      return { width: 720, height: 1280 };
    }
  }

  private async adaptVideoDimensions(
    videoPath: string, 
    targetDimensions: { width: number; height: number }, 
    jobId: string,
    prefix: string
  ): Promise<string> {
    try {
      console.log(`📐 Adaptation des dimensions pour ${prefix}: ${targetDimensions.width}x${targetDimensions.height}`);
      
      const videoInfo = await this.getVideoInfo(videoPath);
      const currentWidth = videoInfo.width;
      const currentHeight = videoInfo.height;
      
      // Vérifier si l'adaptation est nécessaire
      if (currentWidth === targetDimensions.width && currentHeight === targetDimensions.height) {
        console.log(`✅ Dimensions déjà compatibles pour ${prefix}, pas d'adaptation nécessaire`);
        return videoPath;
      }
      
      const adaptedPath = path.join(this.tempPath, `adapted_${prefix}_${jobId}.mp4`);
      
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
          console.log(`📐 Adaptation FFmpeg pour ${prefix}: ${data}`);
        });
        
        ffmpeg.on('close', (code) => {
          if (code !== 0) {
            console.error(`❌ Erreur lors de l'adaptation des dimensions pour ${prefix}: code ${code}`);
            reject(new Error(`Erreur FFmpeg lors de l'adaptation pour ${prefix}: ${code}`));
            return;
          }
          console.log(`✅ Adaptation des dimensions terminée pour ${prefix}`);
          resolve(adaptedPath);
        });
        
        ffmpeg.on('error', (err) => {
          console.error(`❌ Erreur FFmpeg lors de l'adaptation pour ${prefix}:`, err);
          reject(new Error(`Erreur FFmpeg: ${err.message}`));
        });
      });
      
    } catch (error) {
      console.error(`❌ Erreur lors de l'adaptation des dimensions pour ${prefix}:`, error);
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
      await this.supabaseService.upload(bucketName, localFilePath, destinationPath);

      console.log('✅ Upload vers Supabase terminé:', { destinationPath });

    } catch (error) {
      console.error('❌ Erreur lors de l\'upload vers Supabase:', error);
      throw error;
    }
  }



  private async processVideoFields(
    request: MergeRequest, 
    jobId: string
  ): Promise<MergeResponse> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error('Job non trouvé');
    }

    try {
      console.log('🎬 Début du traitement vidéo de présentation');

      // Générer les chemins locaux
      const suffix = '_presentation';
      const prefixVideo1Path = path.join(this.tempPath, `prefix1${suffix}_${jobId}.mp4`);
      const prefixVideo2Path = path.join(this.tempPath, `prefix2${suffix}_${jobId}.mp4`);
      const postfixPath = path.join(this.tempPath, `postfix${suffix}_${jobId}.mp4`);
      const audioPath = request.audioBucketPath ? path.join(this.tempPath, `audio${suffix}_${jobId}.mp3`) : undefined;
      const outputPath = path.join(this.tempPath, `merged${suffix}_${jobId}.mp4`);

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
      
      // Adapter toutes les vidéos aux mêmes dimensions
      const adaptedPrefix1Path = await this.adaptVideoDimensions(prefixVideo1Path, targetDimensions, jobId, `prefix1${suffix}`);
      const adaptedPrefix2Path = await this.adaptVideoDimensions(prefixVideo2Path, targetDimensions, jobId, `prefix2${suffix}`);
      const adaptedPostfixPath = await this.adaptVideoDimensions(postfixPath, targetDimensions, jobId, `postfix${suffix}`);
      
      job.progress = 45;
      job.updatedAt = new Date();

      // Préparer les options FFmpeg
      const ffmpegOptions: FFmpegOptions = {
        prefixVideo1Path: adaptedPrefix1Path,
        prefixVideo2Path: adaptedPrefix2Path,
        postfixPath: adaptedPostfixPath,
        outputPath,
        quality: request.quality,
        resolution: request.resolution,
        fps: request.fps,
        audioCodec: request.audioCodec,
        videoCodec: request.videoCodec,
        threads: parseInt(process.env['FFMPEG_THREADS'] || '4'),
        timeout: parseInt(process.env['FFMPEG_TIMEOUT'] || '300000'),
        metadata: request.metadata as any,
      };

      // Ajouter l'audio si disponible
      if (audioPath) {
        ffmpegOptions.audioPath = audioPath;
      }

      await this.executeTwoStepMerge(ffmpegOptions, jobId);
      
      job.progress = 80;
      job.updatedAt = new Date();

      // Vérifier que le fichier de sortie existe
      if (!await fs.pathExists(outputPath)) {
        throw new Error('Le fichier de sortie n\'a pas été créé');
      }

      // Nettoyer les fichiers temporaires
      const tempFiles = [prefixVideo1Path, prefixVideo2Path, postfixPath, outputPath];
      if (audioPath) {
        tempFiles.push(audioPath);
      }
      // Ajouter les fichiers adaptés s'ils sont différents des originaux
      if (adaptedPrefix1Path !== prefixVideo1Path) {
        tempFiles.push(adaptedPrefix1Path);
      }
      if (adaptedPrefix2Path !== prefixVideo2Path) {
        tempFiles.push(adaptedPrefix2Path);
      }
      if (adaptedPostfixPath !== postfixPath) {
        tempFiles.push(adaptedPostfixPath);
      }
      // Ajouter la vidéo intermédiaire si elle existe
      if (audioPath) {
        const intermediatePath = path.join(this.tempPath, `intermediate${suffix}_${jobId}.mp4`);
        tempFiles.push(intermediatePath);
      }
      await this.cleanupTempFiles(tempFiles);

      // Mettre à jour le job
      job.status = 'completed';
      job.progress = 100;
      job.outputUrl = outputPath;
      job.updatedAt = new Date();

      console.log('✅ Traitement vidéo de présentation terminé avec succès:', outputPath);

      return {
        success: true,
        outputUrl: outputPath,
        jobId
      };

    } catch (error) {
      // Mettre à jour le job en cas d'erreur
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Erreur inconnue';
      job.updatedAt = new Date();

      console.error(`❌ Erreur lors du traitement vidéo:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        jobId
      };
    }
  }


} 