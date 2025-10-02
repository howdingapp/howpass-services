import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseService, VIDEO_BUCKET, SOUND_BUCKET } from './SupabaseService';

// Type parent avec discriminator
export interface BaseMergeRequest {
  type: 'classic' | 'fullsound';
  postfixVideoUrl: string; // Vidéo fournie par le webhook
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

// Type pour la fusion classique
export interface ClassicMergeRequest extends BaseMergeRequest {
  type: 'classic';
  prefixVideo1BucketPath: string; // Première vidéo préfixe (qr_code_scene1_part1.mp4)
  prefixVideo2BucketPath: string; // Deuxième vidéo préfixe (qr_code_scene1_part2.mp4)
  audioBucketPath?: string; // Son optionnel (a9e931e3e10ed43f0ca2a15b96453e86.mp3)
}

// Type pour la fusion avec son complet
export interface MergeWithFullSoundRequest extends BaseMergeRequest {
  type: 'fullsound';
  prefixVideoWithFullSound: string; // Vidéo préfixe avec son complet
  videoDuration: number; // Durée en secondes à extraire de prefixVideoWithFullSound
  qrCodeLessStart: number; // Point de départ en secondes pour la vidéo qr_codeless
}

// Union type pour tous les types de fusion
export type MergeRequest = ClassicMergeRequest | MergeWithFullSoundRequest;

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

type VideoInfo = {
  duration: number;
  width: number;           // dimensions "brutes" du flux tel qu’encodé
  height: number;
  effectiveWidth: number;  // dimensions effectives une fois la rotation appliquée
  effectiveHeight: number;
  rotationDeg: number;     // -180, -90, 0, 90 ou 180
  fps: number;
  bitrate: number;
  audioCodec?: string;
  videoCodec?: string;
  format: string;
  hasVideo: boolean;
  hasAudio: boolean;
};


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

  
  private extractRotationFromStream(stream: any): number {

    console.log(' extractRotationFromStream - Tags:', stream?.tags)
    console.log(' extractRotationFromStream - Side Data List:', stream?.side_data_list)

    // Cas le plus fréquent : tag "rotate"
    if (stream?.tags?.rotate) {
      return parseInt(stream.tags.rotate, 10) || 0;
    }
  
    // Cas alternatif : rotation dans side_data_list
    const sideData = stream?.side_data_list?.find((sd: any) => sd.rotation != null);
    if (sideData) {
      return parseInt(sideData.rotation, 10) || 0;
    }
  
    // Pas de rotation détectée
    return 0;
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
  
      ffmpeg.stdout.on('data', (data) => { output += data.toString(); });
      ffmpeg.stderr.on('data', (data) => { errorOutput += data.toString(); });
  
      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          console.error(`ffprobe error code: ${code}`);
          console.error(`ffprobe stderr: ${errorOutput}`);
          reject(new Error(`ffprobe error code: ${code}`));
          return;
        }
  
        try {
          const metadata = JSON.parse(output);
          const videoStream = (metadata.streams || []).find((s: any) => s.codec_type === 'video');
          const audioStream = (metadata.streams || []).find((s: any) => s.codec_type === 'audio');
  
          if (!videoStream) {
            reject(new Error('Aucun flux vidéo trouvé'));
            return;
          }
  
          const rawW = Number(videoStream.width) || 0;
          const rawH = Number(videoStream.height) || 0;
          const rotationDeg = this.extractRotationFromStream(videoStream);
  
          // Si rotation = ±90, on permute largeur/hauteur pour l'"effectif"
          const rotatedOdd = Math.abs(rotationDeg) % 180 === 90;
          const effectiveWidth  = rotatedOdd ? rawH : rawW;
          const effectiveHeight = rotatedOdd ? rawW : rawH;
  
          const info: VideoInfo = {
            duration: parseFloat(metadata.format?.duration) || 0,
            width: rawW,
            height: rawH,
            effectiveWidth,
            effectiveHeight,
            rotationDeg,
            fps: ((): number => {
              const r = String(videoStream.r_frame_rate || '0/1');
              const parts = r.split('/');
              const num = parts[0] ? Number(parts[0]) : 0;
              const den = parts[1] ? Number(parts[1]) : 1;
              
              if (!parts[0] || !parts[1]) {
                console.warn(`⚠️ FPS manquant: r_frame_rate="${r}", parts[0]="${parts[0]}", parts[1]="${parts[1]}"`);
              } else if (num <= 0 || den <= 0) {
                console.warn(`⚠️ FPS invalide détecté: r_frame_rate="${r}", num=${num}, den=${den}`);
              }
              
              return num > 0 && den > 0 ? num / den : 0;
            })(),
            bitrate: metadata.format?.bit_rate ? parseInt(metadata.format.bit_rate, 10) : 0,
            audioCodec: audioStream?.codec_name,
            videoCodec: videoStream?.codec_name,
            format: metadata.format?.format_name || 'unknown',
            hasVideo: !!videoStream,
            hasAudio: !!audioStream
          };
  
          resolve(info);
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
      
      // Utiliser le discriminator pour choisir la fonction appropriée
      switch (request.type) {
        case 'fullsound':
          console.log(`📹 Prefix Video with Full Sound: ${request.prefixVideoWithFullSound}`);
          console.log(`⏱️ Video Duration: ${request.videoDuration}s`);
          console.log(`📹 Postfix: ${request.postfixVideoUrl}`);
          return await this.processVideoWithFullSound(request, jobId);
          
        case 'classic':
          console.log(`📹 Prefix Video 1: ${request.prefixVideo1BucketPath}`);
          console.log(`📹 Prefix Video 2: ${request.prefixVideo2BucketPath}`);
          console.log(`📹 Postfix: ${request.postfixVideoUrl}`);
          if (request.audioBucketPath) {
            console.log(`🎵 Audio: ${request.audioBucketPath}`);
          }
          return await this.processVideoFields(request, jobId);
          
        default:
          throw new Error(`Type de fusion non supporté: ${(request as any).type}`);
      }
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
        const midTimestamp = Date.now();
        const midDestinationPath = `${table}/${recordId}/qr_code_less_presentation_video_${midTimestamp}.mp4`;
        
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
        const finalTimestamp = Date.now();
        const destinationPath = `${table}/${recordId}/qr_code_presentation_video_${finalTimestamp}.mp4`;
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
        '-i', audioPath,          // musique (plus longue)
        '-filter_complex',
          // Concat vidéo seule
          '[0:v][1:v]concat=n=2:v=1:a=0[v];' +
          // Remet l’audio à t=0 (pas d’étirement)
          '[2:a]asetpts=PTS-STARTPTS[a]',
        '-map', '[v]',
        '-map', '[a]',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-r', (options.fps || 25).toString(),
        '-crf', options.quality === 'low' ? '28' : options.quality === 'medium' ? '23' : '18',
        '-threads', (options.threads || 4).toString(),
        // Coupe automatiquement l’audio à la fin de la vidéo
        '-shortest',
        // Optionnel: meilleur démarrage pour le web
        '-movflags', '+faststart',
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

  private async getDimensions(videoPath: string): Promise<{ width: number; height: number }> {
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

  private async forcePortraitOrientation(
    videoPath: string, 
    jobId: string, 
    prefix: string
  ): Promise<string> {
    try {
      console.log(`🔄 Forçage du mode portrait pour ${prefix}...`);
      
      const videoInfo = await this.getVideoInfo(videoPath);
      const currentWidth = videoInfo.width;
      const currentHeight = videoInfo.height;
      const rotationDeg = videoInfo.rotationDeg;
      
      // Vérifier si une rotation physique est nécessaire
      // Si les dimensions brutes sont différentes des dimensions effectives, 
      // c'est qu'une rotation a été appliquée via un tag
      const needsPhysicalRotation = (currentWidth !== videoInfo.effectiveWidth || currentHeight !== videoInfo.effectiveHeight) && (rotationDeg % 360 !== 0);
      
      if (!needsPhysicalRotation) {
        console.log(`✅ ${prefix} n'a pas besoin de rotation physique (${currentWidth}x${currentHeight}, rotation: ${rotationDeg}°)`);
        return videoPath;
      }
      
      const rotatedPath = path.join(this.tempPath, `rotated_${prefix}_${jobId}.mp4`);
      
      return new Promise((resolve, reject) => {
        // Déterminer la rotation à appliquer selon la valeur de rotationDeg
        // Pour une vidéo avec rotation dans les métadonnées, on doit appliquer la rotation inverse
        // pour "annuler" la rotation des métadonnées et obtenir la vraie orientation
        let transposeValue = '0'; // Pas de rotation
        
        if (rotationDeg === 90) {
          transposeValue = '3'; // 90° antihoraire pour annuler 90° horaire
        } else if (rotationDeg === -90) {
          transposeValue = '1'; // 90° horaire pour annuler -90°
        }
        
        console.log(`📐 Rotation détectée: ${rotationDeg}° -> transpose=${transposeValue}`);
        
        console.log(`🔄 Application de la rotation physique pour ${prefix}: ${currentWidth}x${currentHeight} (rotation: ${rotationDeg}°) -> transpose=${transposeValue}`);
        
        const args = [
          '-noautorotate',
          '-i', videoPath,
          '-vf', `transpose=${transposeValue}`,
          '-c:v', 'libx264',
          '-c:a', 'copy', // Copier l'audio sans ré-encodage
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-metadata:s:v:0', 'rotate=0', // Supprimer la rotation des métadonnées
          '-y',
          rotatedPath
        ];
        
        console.log('🎬 Arguments FFmpeg (rotation):', args.join(' '));
        
        const ffmpeg = spawn('ffmpeg', args);
        
        ffmpeg.stderr.on('data', (data) => {
          console.log(`🔄 Rotation FFmpeg pour ${prefix}: ${data}`);
        });
        
        ffmpeg.on('close', async (code) => {
          if (code !== 0) {
            console.error(`❌ Erreur lors de la rotation pour ${prefix}: code ${code}`);
            reject(new Error(`Erreur FFmpeg lors de la rotation pour ${prefix}: ${code}`));
            return;
          }
          
          // Vérifier que le fichier rotaté existe et a du contenu
          try {
            const rotatedInfo = await this.getVideoInfo(rotatedPath);
            console.log(`✅ Rotation terminée pour ${prefix}: ${rotatedPath}`);
            console.log(`📐 Dimensions après rotation: ${rotatedInfo.width}x${rotatedInfo.height}`);
            
            if (rotatedInfo.width <= 0 || rotatedInfo.height <= 0) {
              console.error(`❌ Dimensions invalides après rotation pour ${prefix}: ${rotatedInfo.width}x${rotatedInfo.height}`);
              reject(new Error(`Dimensions invalides après rotation pour ${prefix}`));
              return;
            }
            
            resolve(rotatedPath);
          } catch (error) {
            console.error(`❌ Erreur lors de la vérification du fichier rotaté pour ${prefix}:`, error);
            reject(new Error(`Erreur lors de la vérification du fichier rotaté pour ${prefix}`));
          }
        });
        
        ffmpeg.on('error', (err) => {
          console.error(`❌ Erreur FFmpeg lors de la rotation pour ${prefix}:`, err);
          reject(new Error(`Erreur FFmpeg: ${err.message}`));
        });
      });
      
    } catch (error) {
      console.error(`❌ Erreur lors de la rotation pour ${prefix}:`, error);
      // En cas d'erreur, retourner le chemin original
      return videoPath;
    }
  }

  private async adaptVideoDimensionsAndRemoveAudio(
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
      const filter = this.buildAdaptationFilter(currentWidth, currentHeight, targetDimensions);

      console.log(`🔧 Filtre d'adaptation pour ${prefix}: ${filter}`);

      return new Promise((resolve, reject) => {
        const args = [
          '-hide_banner',
          '-i', videoPath,
          '-vf', filter,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-crf', '18',
          '-preset', 'medium',
          '-movflags', '+faststart',
          '-an',               // ⚡ pas d'audio
          '-y', adaptedPath
        ];

        console.log('🎬 Arguments FFmpeg (adaptation):', args.join(' '));

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
    const { width: W, height: H } = targetDimensions;
    const currentRatio = currentWidth / currentHeight;
    const targetRatio = W / H;
  
    if (currentRatio > targetRatio) {
      // plus large -> scale sur largeur, pad en hauteur
      return `[0:v]scale=${W}:-2,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[vout]`;
    } else if (currentRatio < targetRatio) {
      // plus haut -> scale sur hauteur, pad en largeur
      return `[0:v]scale=-2:${H},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[vout]`;
    } else {
      // même ratio
      return `[0:v]scale=${W}:${H},setsar=1[vout]`;
    }
  }


  private async detectCropParameters(
    videoPath: string,
    duration?: number
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return new Promise((resolve) => {
      const ffmpegArgs = [
        ...(duration ? ['-t', String(duration)] : []),
        '-i', videoPath,
        // seuil=12, arrondi=16 (H.264-friendly), reset=0 (pas de reset)
        '-vf', 'cropdetect=40:16:0',
        '-f', 'null',
        '-'
      ];
  
      console.log('🎬 Args FFmpeg (detect crop):', ffmpegArgs.join(' '));
  
      const ff = spawn('ffmpeg', ffmpegArgs);
  
      type Crop = { x: number; y: number; width: number; height: number };
      const crops: Crop[] = [];
  
      ff.stderr.on('data', (buf) => {
        const str = buf.toString();
        // on ne prend que la 1re occurrence par chunk (suffisant)
        const m = str.match(/crop=(\d+):(\d+):(\d+):(\d+)/);
        if (!m) return;
        const w = parseInt(m[1], 10);
        const h = parseInt(m[2], 10);
        const x = parseInt(m[3], 10);
        const y = parseInt(m[4], 10);
  
        // ✅ x/y peuvent être 0 ; on valide plutôt >0 pour w/h
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 &&
            Number.isFinite(x) && Number.isFinite(y)) {
          crops.push({ x, y, width: w, height: h });
        }
      });
  
      ff.on('close', () => {
        if (crops.length === 0) {
          console.log('⚠️ Aucun crop détecté');
          resolve(null);
          return;
        }
  
        // Intersection des rectangles détectés (plus petit commun)
        let left = 0, top = 0;
        let right = Infinity, bottom = Infinity;
  
        for (const c of crops) {
          left   = Math.max(left, c.x);
          top    = Math.max(top, c.y);
          right  = Math.min(right, c.x + c.width);
          bottom = Math.min(bottom, c.y + c.height);
        }
  
        let w = Math.max(0, Math.floor(right - left));
        let h = Math.max(0, Math.floor(bottom - top));
  
        // Si intersection vide (valeurs aberrantes), fallback au plus petit w/h observé
        if (w === 0 || h === 0) {
          const min = crops.reduce((acc, c) =>
            c.width * c.height < acc.width * acc.height ? c : acc, crops[0]!);
          left = min.x; top = min.y; w = min.width; h = min.height;
        }
  
        // Arrondi à un multiple (2 ou 16). Ici 2 pour être souple.
        const roundTo = 2;
        const round = (n: number) => n - (n % roundTo);
        const result = { x: round(left), y: round(top), width: round(w), height: round(h) };
  
        console.log(`✅ Crop final (intersection): ${result.width}x${result.height}+${result.x}+${result.y}`);
  
        // Optionnel: si c’est déjà plein cadre (pas de bandes), renvoyer null
        // Pour ça, on a besoin de connaître la taille source (ex. via ffprobe).
        // Ici on ne l’a pas, donc on renvoie le crop calculé.
        resolve(result);
      });
  
      ff.on('error', (err) => {
        console.error('❌ Erreur ffmpeg:', err);
        resolve(null);
      });
    });
  }

  private async cropVideo(
    videoPath: string, 
    jobId: string, 
    prefix: string,
    duration?: number,
  ): Promise<string> {
    try {
      console.log(`✂️ Détection et suppression des bandes noires pour ${prefix}...`);
      
      // Vérifier d'abord les dimensions originales
      const originalInfo = await this.getVideoInfo(videoPath);
      console.log(`📐 Dimensions originales pour ${prefix}: ${originalInfo.width}x${originalInfo.height}`);
      
      // Détecter les paramètres de crop (analyser 1 seconde par défaut)
      const cropParams = await this.detectCropParameters(videoPath, duration);
      
      if (!cropParams) {
        console.log(`✅ Aucune bande noire détectée pour ${prefix}, pas de crop nécessaire`);
        return videoPath;
      }
      
      // Vérifier que les paramètres de crop sont valides
      if (cropParams.width <= 0 || cropParams.height <= 0 || 
          cropParams.x < 0 || cropParams.y < 0 ||
          cropParams.x + cropParams.width > originalInfo.width ||
          cropParams.y + cropParams.height > originalInfo.height) {
        console.log(`⚠️ Paramètres de crop invalides pour ${prefix}:`, cropParams);
        console.log(`⚠️ Dimensions originales: ${originalInfo.width}x${originalInfo.height}`);
        console.log(`⚠️ Pas de crop appliqué pour ${prefix}`);
        return videoPath;
      }
      
      const croppedPath = path.join(this.tempPath, `cropped_${prefix}_${jobId}.mp4`);
      
      return new Promise((resolve, reject) => {
        console.log(`✂️ Application du crop pour ${prefix}:`, cropParams);
        
        const args = [
          '-i', videoPath,
          '-vf', `crop=${cropParams.width}:${cropParams.height}:${cropParams.x}:${cropParams.y}`,
          '-c:a', 'copy', // Copier l'audio sans ré-encodage
          '-y',
          croppedPath
        ];
        
        const ffmpeg = spawn('ffmpeg', args);
        
        ffmpeg.stderr.on('data', (data) => {
          console.log(`✂️ FFmpeg (crop) pour ${prefix}: ${data}`);
        });
        
        ffmpeg.on('close', async (code) => {
          if (code !== 0) {
            console.error(`❌ Erreur lors du crop pour ${prefix}: code ${code}`);
            reject(new Error(`Erreur FFmpeg lors du crop pour ${prefix}: ${code}`));
            return;
          }
          
          // Vérifier que le fichier croppé existe et a du contenu
          try {
            const croppedInfo = await this.getVideoInfo(croppedPath);
            console.log(`✅ Crop terminé pour ${prefix}: ${croppedPath}`);
            console.log(`📐 Dimensions après crop: ${croppedInfo.width}x${croppedInfo.height}`);
            
            if (croppedInfo.width <= 0 || croppedInfo.height <= 0) {
              console.error(`❌ Dimensions invalides après crop pour ${prefix}: ${croppedInfo.width}x${croppedInfo.height}`);
              reject(new Error(`Dimensions invalides après crop pour ${prefix}`));
              return;
            }
            
            resolve(croppedPath);
          } catch (error) {
            console.error(`❌ Erreur lors de la vérification du fichier croppé pour ${prefix}:`, error);
            reject(new Error(`Erreur lors de la vérification du fichier croppé pour ${prefix}`));
          }
        });
        
        ffmpeg.on('error', (err) => {
          console.error(`❌ Erreur FFmpeg lors du crop pour ${prefix}:`, err);
          reject(new Error(`Erreur FFmpeg: ${err.message}`));
        });
      });
      
    } catch (error) {
      console.error(`❌ Erreur lors du crop pour ${prefix}:`, error);
      // En cas d'erreur, retourner le chemin original
      return videoPath;
    }
  }

  private async trimVideo(
    inputPath: string, 
    startTime: number, 
    duration: number, 
    jobId: string, 
    prefix: string
  ): Promise<string> {
    const trimmedPath = path.join(this.tempPath, `${prefix}_${jobId}.mp4`);
    
    return new Promise((resolve, reject) => {
      console.log(`✂️ Découpage de la vidéo: ${startTime}s à ${startTime + duration}s`);
      
      const args = [
        '-i', inputPath,
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-c', 'copy', // Copie sans ré-encodage pour plus de rapidité
        '-avoid_negative_ts', 'make_zero',
        '-y',
        trimmedPath
      ];
      
      const ffmpeg = spawn('ffmpeg', args);
      
      ffmpeg.stderr.on('data', (data) => {
        console.log(`✂️ FFmpeg (trim): ${data}`);
      });
      
      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          console.error(`❌ Erreur lors du découpage de la vidéo: code ${code}`);
          reject(new Error(`Erreur FFmpeg lors du découpage: ${code}`));
          return;
        }
        console.log(`✅ Découpage de la vidéo terminé: ${trimmedPath}`);
        resolve(trimmedPath);
      });
      
      ffmpeg.on('error', (err) => {
        console.error(`❌ Erreur FFmpeg lors du découpage:`, err);
        reject(new Error(`Erreur FFmpeg: ${err.message}`));
      });
    });
  }

  private async createQrCodeLessVideoWithFullSound(
    prefixPath: string, 
    postfixPath: string, 
    outputPath: string, 
    request: MergeWithFullSoundRequest
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🎬 Création de la vidéo qr_codeless...');

      const args = [
        '-i', prefixPath,        // vidéo prefix complète
        '-i', postfixPath,       // vidéo postfix
        '-filter_complex',
          // Concat vidéo
          '[0:v][1:v]concat=n=2:v=1:a=0[v];' +
          // Utiliser l'audio de la vidéo prefix pour toute la durée
          '[0:a]asetpts=PTS-STARTPTS[a]',
        '-map', '[v]',
        '-map', '[a]',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-r', (request.fps || 25).toString(),
        '-crf', request.quality === 'low' ? '28' : request.quality === 'medium' ? '23' : '18',
        '-threads', (parseInt(process.env['FFMPEG_THREADS'] || '4')).toString(),
        // Coupe automatiquement l'audio à la fin de la vidéo
        '-shortest',
        // Optionnel: meilleur démarrage pour le web
        '-movflags', '+faststart',
        '-y',
        outputPath
      ];

      console.log('🎬 Arguments FFmpeg (qr_codeless):', args.join(' '));

      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log(`🎬 FFmpeg (qr_codeless): ${data}`);
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          console.error(`❌ Erreur FFmpeg (qr_codeless): code ${code}`);
          console.error(`❌ FFmpeg stderr: ${stderr}`);
          reject(new Error(`ffmpeg error code: ${code}`));
          return;
        }
        console.log('✅ Vidéo qr_codeless créée avec succès');
        resolve();
      });

      ffmpeg.on('error', (err) => {
        console.error('❌ Erreur lors de la création de la vidéo qr_codeless:', err);
        reject(new Error(`Erreur FFmpeg: ${err.message}`));
      });

      const timeout = parseInt(process.env['FFMPEG_TIMEOUT'] || '300000');
      if (timeout) {
        setTimeout(() => {
          ffmpeg.kill('SIGKILL');
          reject(new Error('Timeout lors de la création de la vidéo qr_codeless'));
        }, timeout);
      }
    });
  }

  private async createQrCodeWithFullSound(
    prefixPath: string, 
    postfixPath: string, 
    outputPath: string, 
    request: MergeWithFullSoundRequest
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('🎬 Fusion des vidéos avec son complet...');
        
        // Vérifier que les fichiers d'entrée existent et ont du contenu
        console.log(`🔍 Vérification des fichiers d'entrée...`);
        const prefixInfo = await this.getVideoInfo(prefixPath);
        const postfixInfo = await this.getVideoInfo(postfixPath);
        
        console.log(`📹 Prefix: ${prefixInfo.width}x${prefixInfo.height}, durée: ${prefixInfo.duration}s, audio: ${prefixInfo.audioCodec || 'aucun'}`);
        console.log(`📹 Postfix: ${postfixInfo.width}x${postfixInfo.height}, durée: ${postfixInfo.duration}s, audio: ${postfixInfo.audioCodec || 'aucun'}`);
        
        if (!prefixInfo.audioCodec) {
          console.warn('⚠️ Aucun flux audio détecté dans la vidéo prefix');
        }
        
        if (!postfixInfo.audioCodec) {
          console.warn('⚠️ Aucun flux audio détecté dans la vidéo postfix');
        }

        const args = [
          '-i', prefixPath,        // vidéo prefix avec son
          '-i', postfixPath,       // vidéo postfix
          '-filter_complex',
            // Concat vidéo
            '[0:v][1:v]concat=n=2:v=1:a=0[v];' +
            // Utiliser l'audio de la vidéo prefix pour toute la durée
            '[0:a]asetpts=PTS-STARTPTS[a]',
          '-map', '[v]',
          '-map', '[a]',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-r', (request.fps || 25).toString(),
          '-crf', request.quality === 'low' ? '28' : request.quality === 'medium' ? '23' : '18',
          '-threads', (parseInt(process.env['FFMPEG_THREADS'] || '4')).toString(),
          // Coupe automatiquement l'audio à la fin de la vidéo
          '-shortest',
          // Optionnel: meilleur démarrage pour le web
          '-movflags', '+faststart',
          '-y',
          outputPath
        ];

        console.log('🎬 Arguments FFmpeg (fusion avec son complet):', args.join(' '));

        const ffmpeg = spawn('ffmpeg', args);

        let stderr = '';

        ffmpeg.stderr.on('data', (data) => {
          stderr += data.toString();
          console.log(`🎬 FFmpeg (fusion avec son complet): ${data}`);
        });

        ffmpeg.on('close', async (code) => {
          if (code !== 0) {
            console.error(`❌ Erreur FFmpeg (fusion avec son complet): code ${code}`);
            console.error(`❌ FFmpeg stderr: ${stderr}`);
            reject(new Error(`ffmpeg error code: ${code}`));
            return;
          }
          
          // Vérifier que le fichier de sortie a été créé et a du contenu
          try {
            const outputInfo = await this.getVideoInfo(outputPath);
            console.log(`✅ Fusion avec son complet terminée avec succès`);
            console.log(`📹 Fichier de sortie: ${outputInfo.width}x${outputInfo.height}, durée: ${outputInfo.duration}s`);
            resolve();
          } catch (error) {
            console.error(`❌ Erreur lors de la vérification du fichier de sortie:`, error);
            reject(new Error(`Erreur lors de la vérification du fichier de sortie: ${error instanceof Error ? error.message : 'Erreur inconnue'}`));
          }
        });

        ffmpeg.on('error', (err) => {
          console.error('❌ Erreur lors de la fusion avec son complet:', err);
          reject(new Error(`Erreur FFmpeg: ${err.message}`));
        });

        const timeout = parseInt(process.env['FFMPEG_TIMEOUT'] || '300000');
        if (timeout) {
          setTimeout(() => {
            ffmpeg.kill('SIGKILL');
            reject(new Error('Timeout lors de la fusion avec son complet'));
          }, timeout);
        }
      } catch (error) {
        console.error('❌ Erreur lors de la préparation de la fusion:', error);
        reject(new Error(`Erreur lors de la préparation de la fusion: ${error instanceof Error ? error.message : 'Erreur inconnue'}`));
      }
    });
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



  private async processVideoWithFullSound(
    request: MergeWithFullSoundRequest, 
    jobId: string
  ): Promise<MergeResponse> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error('Job non trouvé');
    }

    try {
      console.log('🎬 Début du traitement vidéo avec son complet');

      // Générer les chemins locaux
      const suffix = '_fullsound';
      const prefixVideoPath = path.join(this.tempPath, `prefix${suffix}_${jobId}.mp4`);
      const postfixPath = path.join(this.tempPath, `postfix${suffix}_${jobId}.mp4`);
      const outputPath = path.join(this.tempPath, `merged${suffix}_${jobId}.mp4`);
      const qrCodeLessOutputPath = path.join(this.tempPath, `qr_codeless${suffix}_${jobId}.mp4`);

      // Mettre à jour le statut
      job.status = 'processing';
      job.progress = 10;
      job.updatedAt = new Date();

      // Télécharger les vidéos depuis Supabase
      console.log('📥 Téléchargement des vidéos...');
      await this.supabaseService.download(VIDEO_BUCKET, request.prefixVideoWithFullSound!, prefixVideoPath);
      job.progress = 20;
      job.updatedAt = new Date();

      // Extraire le chemin du fichier depuis l'URL publique
      const urlParts = request.postfixVideoUrl.split('/');
      const filePath = urlParts.slice(-3).join('/'); // Prend les 3 derniers segments
      
      await this.supabaseService.download(VIDEO_BUCKET, filePath, postfixPath);
      job.progress = 30;
      job.updatedAt = new Date();

      // Forcer d'abord le mode portrait pour toutes les vidéos
      console.log('🔄 Forçage du mode portrait...');
      const portraitPrefixPath = await this.forcePortraitOrientation(prefixVideoPath, jobId, `prefix${suffix}`);
      const portraitPostfixPath = await this.forcePortraitOrientation(postfixPath, jobId, `postfix${suffix}`);
      
      job.progress = 35;
      job.updatedAt = new Date();

      // Utiliser directement les vidéos portrait
      console.log('✅ Utilisation des vidéos portrait directement');
      const finalPrefixPath = portraitPrefixPath;
      const finalPostfixPath = portraitPostfixPath;
      
      // Valider que les vidéos sont bien en mode portrait (hauteur > largeur)
      console.log('✅ Validation du mode portrait...');
      const prefixVideoInfo = await this.getVideoInfo(finalPrefixPath);
      const postfixVideoInfo = await this.getVideoInfo(finalPostfixPath);
      
      if (prefixVideoInfo.height <= prefixVideoInfo.width) {
        throw new Error(`La vidéo prefix n'est pas en mode portrait: ${prefixVideoInfo.width}x${prefixVideoInfo.height}`);
      }
      
      if (postfixVideoInfo.height <= postfixVideoInfo.width) {
        throw new Error(`La vidéo postfix n'est pas en mode portrait: ${postfixVideoInfo.width}x${postfixVideoInfo.height}`);
      }
      
      console.log(`✅ Validation réussie - Prefix: ${prefixVideoInfo.width}x${prefixVideoInfo.height}, Postfix: ${postfixVideoInfo.width}x${postfixVideoInfo.height}`);
      
      job.progress = 37;
      job.updatedAt = new Date();

      // Analyser les dimensions des vidéos en mode portrait
      console.log('📐 Analyse des dimensions des vidéos en mode portrait...');
      const targetDimensions = await this.getDimensions(finalPostfixPath);
      
      // Adapter toutes les vidéos aux mêmes dimensions
      const adaptedPrefixPath = await this.adaptVideoDimensionsAndRemoveAudio(finalPrefixPath, targetDimensions, jobId, `prefix${suffix}`);
      const adaptedPostfixPath = await this.adaptVideoDimensionsAndRemoveAudio(finalPostfixPath, targetDimensions, jobId, `postfix${suffix}`);
      
      job.progress = 40;
      job.updatedAt = new Date();

      job.progress = 50;
      job.updatedAt = new Date();

      // Vérifier que les vidéos adaptées ont du contenu valide
      console.log('🔍 Vérification des vidéos avant fusion...');
      const prefixInfo = await this.getVideoInfo(adaptedPrefixPath);
      const postfixInfo = await this.getVideoInfo(adaptedPostfixPath);
      
      console.log(`📐 Vidéo prefix adaptée: ${prefixInfo.width}x${prefixInfo.height}, durée: ${prefixInfo.duration}s`);
      console.log(`📐 Vidéo postfix adaptée: ${postfixInfo.width}x${postfixInfo.height}, durée: ${postfixInfo.duration}s`);
      
      if (prefixInfo.width <= 0 || prefixInfo.height <= 0 || prefixInfo.duration <= 0) {
        throw new Error(`Vidéo prefix invalide après adaptation: ${prefixInfo.width}x${prefixInfo.height}, durée: ${prefixInfo.duration}s`);
      }
      
      if (postfixInfo.width <= 0 || postfixInfo.height <= 0 || postfixInfo.duration <= 0) {
        throw new Error(`Vidéo postfix invalide après adaptation: ${postfixInfo.width}x${postfixInfo.height}, durée: ${postfixInfo.duration}s`);
      }

      // Fusionner les vidéos avec le son de la vidéo prefix (sans trim)
      console.log('🎬 Fusion des vidéos avec son complet...');
      await this.createQrCodeWithFullSound(adaptedPrefixPath, adaptedPostfixPath, outputPath, request);
      
      job.progress = 60;
      job.updatedAt = new Date();

      // Créer la vidéo qr_codeless
      console.log(`🎬 Création de la vidéo qr_codeless à partir de ${request.qrCodeLessStart}s...`);
      const qrCodeLessPrefixPath = await this.trimVideo(adaptedPrefixPath, request.qrCodeLessStart, request.videoDuration - request.qrCodeLessStart, jobId, `qr_codeless_prefix${suffix}`);
      await this.createQrCodeLessVideoWithFullSound(qrCodeLessPrefixPath, adaptedPostfixPath, qrCodeLessOutputPath, request);
      
      job.progress = 80;
      job.updatedAt = new Date();

      // Vérifier que les fichiers de sortie existent
      if (!await fs.pathExists(outputPath)) {
        throw new Error('Le fichier de sortie principal n\'a pas été créé');
      }
      if (!await fs.pathExists(qrCodeLessOutputPath)) {
        throw new Error('Le fichier de sortie qr_codeless n\'a pas été créé');
      }

      // Upload des vidéos vers Supabase
      console.log('📤 Upload des vidéos vers Supabase...');
      const table = request.metadata?.table || 'practices';
      const recordId = request.metadata?.recordId || jobId;
      const timestamp = Date.now();
      
      // Upload de la vidéo principale
      const mainDestinationPath = `${table}/${recordId}/qr_code_presentation_video_${timestamp}.mp4`;
      const mergedVideoOutputUrl = await this.supabaseService.upload(VIDEO_BUCKET, outputPath, mainDestinationPath);
      
      // Upload de la vidéo qr_codeless
      const qrCodeLessDestinationPath = `${table}/${recordId}/qr_code_less_presentation_video_${timestamp}.mp4`;
      const qrCodeLessVideoOutputUrl = await this.supabaseService.upload(VIDEO_BUCKET, qrCodeLessOutputPath, qrCodeLessDestinationPath);

      // Mettre à jour les champs dans la base de données
      console.log('📝 Mise à jour des champs dans la base de données...');
      const updateMainSuccess = await this.supabaseService.updateQrCodePresentationVideoUrl(table, recordId, mergedVideoOutputUrl);
      const updateQrCodeLessSuccess = await this.supabaseService.updateQrCodePresentationVideoMidUrl(table, recordId, qrCodeLessVideoOutputUrl);
      
      if (!updateMainSuccess) {
        console.error('❌ Échec de la mise à jour du champ qr_code_presentation_video_public_url pour:', { table, recordId });
        throw new Error('Échec de la mise à jour de la base de données (vidéo principale)');
      }
      if (!updateQrCodeLessSuccess) {
        console.error('❌ Échec de la mise à jour du champ qr_code_less_presentation_video_public_url pour:', { table, recordId });
        throw new Error('Échec de la mise à jour de la base de données (vidéo qr_codeless)');
      }

      console.log('✅ Champs mis à jour avec succès');

      // Nettoyer les fichiers temporaires
      const tempFiles = [
        prefixVideoPath, 
        postfixPath, 
        outputPath, 
        qrCodeLessOutputPath, 
        portraitPrefixPath, 
        portraitPostfixPath,
        adaptedPrefixPath, 
        adaptedPostfixPath, 
        qrCodeLessPrefixPath
      ];
      await this.cleanupTempFiles(tempFiles);

      // Mettre à jour le job
      job.status = 'completed';
      job.progress = 100;
      job.outputUrl = outputPath;
      job.updatedAt = new Date();

      console.log('✅ Traitement vidéo avec son complet terminé avec succès:', outputPath);

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

      console.error(`❌ Erreur lors du traitement vidéo avec son complet:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        jobId
      };
    }
  }

  private async processVideoFields(
    request: ClassicMergeRequest, 
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
      const filePath = urlParts.slice(-3).join('/'); // Prend les 3 derniers segments
      
      await this.supabaseService.download(VIDEO_BUCKET, filePath, postfixPath);
      job.progress = 40;
      job.updatedAt = new Date();

      // Forcer le mode portrait pour toutes les vidéos
      console.log('🔄 Forçage du mode portrait...');
      const portraitPrefix1Path = await this.forcePortraitOrientation(prefixVideo1Path, jobId, `prefix1${suffix}`);
      const portraitPrefix2Path = await this.forcePortraitOrientation(prefixVideo2Path, jobId, `prefix2${suffix}`);
      const portraitPostfixPath = await this.forcePortraitOrientation(postfixPath, jobId, `postfix${suffix}`);
      
      // Analyser les dimensions des vidéos en mode portrait
      console.log('📐 Analyse des dimensions des vidéos en mode portrait...');
      const targetDimensions = await this.getDimensions(portraitPostfixPath);
      
      // Adapter toutes les vidéos aux mêmes dimensions
      const adaptedPrefix1Path = await this.adaptVideoDimensionsAndRemoveAudio(portraitPrefix1Path, targetDimensions, jobId, `prefix1${suffix}`);
      const adaptedPrefix2Path = await this.adaptVideoDimensionsAndRemoveAudio(portraitPrefix2Path, targetDimensions, jobId, `prefix2${suffix}`);
      const adaptedPostfixPath = await this.adaptVideoDimensionsAndRemoveAudio(portraitPostfixPath, targetDimensions, jobId, `postfix${suffix}`);
      
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
      // Ajouter les fichiers en mode portrait
      tempFiles.push(portraitPrefix1Path, portraitPrefix2Path, portraitPostfixPath);
      // Ajouter les fichiers adaptés s'ils sont différents des originaux
      if (adaptedPrefix1Path !== portraitPrefix1Path) {
        tempFiles.push(adaptedPrefix1Path);
      }
      if (adaptedPrefix2Path !== portraitPrefix2Path) {
        tempFiles.push(adaptedPrefix2Path);
      }
      if (adaptedPostfixPath !== portraitPostfixPath) {
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