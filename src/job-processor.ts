import { VideoService, MergeRequest } from './services/VideoService';
import { SupabaseService } from './services/SupabaseService';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

async function processVideoJob() {
  try {
    console.log('🎬 Démarrage du traitement vidéo...');

    // Récupérer les paramètres depuis les variables d'environnement
    const mergeRequestStr = process.env['MERGE_REQUEST'];
    const table = process.env['TABLE'];
    const recordId = process.env['RECORD_ID'];

    if (!mergeRequestStr || !table || !recordId) {
      throw new Error('Variables d\'environnement manquantes: MERGE_REQUEST, TABLE, RECORD_ID');
    }

    const mergeRequest: MergeRequest = JSON.parse(mergeRequestStr);
    
    console.log('📊 Paramètres du job:', {
      table,
      recordId,
      prefixVideo1: mergeRequest.prefixVideo1BucketPath,
      prefixVideo2: mergeRequest.prefixVideo2BucketPath,
      postfix: mergeRequest.postfixVideoUrl
    });

    // Initialiser les services
    const videoService = new VideoService();
    const supabaseService = new SupabaseService();

    // Traiter la fusion vidéo
    const result = await videoService.mergeVideos(mergeRequest);

    if (result.success && result.outputUrl) {
      console.log('✅ Fusion terminée avec succès:', { jobId: result.jobId });

      // Construire le chemin de destination dans le bucket
      const bucketName = process.env['SUPABASE_BUCKET_NAME'];
      if (!bucketName) {
        throw new Error('Variable d\'environnement SUPABASE_BUCKET_NAME non définie');
      }

      const destinationPath = `${table}/${recordId}.mp4`;
      console.log('📤 Upload vers Supabase:', { bucketName, destinationPath });

      // Uploader le fichier fusionné vers Supabase
      await videoService.uploadToSupabase(result.outputUrl, bucketName, destinationPath);

      console.log('✅ Upload vers Supabase terminé:', { destinationPath });

      // Mettre à jour le champ qr_code_presentation_video_public_url dans la base de données
      const updateSuccess = await supabaseService.updateQrCodePresentationVideoUrl(table, recordId, destinationPath);
      
      if (!updateSuccess) {
        console.error('❌ Échec de la mise à jour du champ qr_code_presentation_video_public_url pour:', { table, recordId });
        process.exit(1);
      }

      console.log('✅ Traitement vidéo terminé avec succès');
      process.exit(0);

    } else {
      console.error('❌ Échec du merge:', result.error);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Erreur lors du traitement vidéo:', error);
    process.exit(1);
  }
}

// Démarrer le traitement si ce fichier est exécuté directement
if (require.main === module) {
  processVideoJob();
} 