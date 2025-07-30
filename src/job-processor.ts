import { VideoService } from './services/VideoService';
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

    const mergeRequest = JSON.parse(mergeRequestStr);

    console.log('📊 Paramètres du job:', mergeRequestStr);

    // Initialiser les services
    const videoService = new VideoService();
    const supabaseService = new SupabaseService();

    // Vérifier les champs à traiter et les passer à "computing"
    const fieldsToProcess = await checkAndUpdateFieldsToCompute(supabaseService, table, recordId);
    
    if (fieldsToProcess.length === 0) {
      console.log('ℹ️ Aucun champ à traiter trouvé');
      process.exit(0);
    }

    console.log('🔧 Champs à traiter:', fieldsToProcess);

    // Traiter la fusion vidéo
    const result = await videoService.mergeVideos(mergeRequest);

    if (result.success && result.outputUrl) {
      console.log('✅ Fusion terminée avec succès:', { jobId: result.jobId });
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

async function checkAndUpdateFieldsToCompute(supabaseService: SupabaseService, table: string, recordId: string): Promise<string[]> {
  try {
    console.log('🔍 Vérification des champs à traiter:', { table, recordId });

    // Récupérer les champs actuels
    const { data, error } = await supabaseService.getSupabaseClient()
      .from(table)
      .select(`
        qr_code_presentation_video_public_url,
        qr_code_less_presentation_video_public_url,
        qr_code_default_presentation_video_public_url,
        qr_code_less_default_presentation_video_public_url,
        presentation_video_public_url,
        default_presentation_video_public_url
      `)
      .eq('id', recordId)
      .single();

    if (error) {
      console.error('❌ Erreur lors de la récupération des champs:', error);
      return [];
    }

    const fieldsToProcess: string[] = [];
    const updates: any = {};

    // Vérifier les champs QR code de présentation
    if (data.presentation_video_public_url) {
      if (data.qr_code_presentation_video_public_url === 'to_compute') {
        fieldsToProcess.push('qr_code_presentation_video_public_url');
        updates.qr_code_presentation_video_public_url = 'computing';
      }
      if (data.qr_code_less_presentation_video_public_url === 'to_compute') {
        fieldsToProcess.push('qr_code_less_presentation_video_public_url');
        updates.qr_code_less_presentation_video_public_url = 'computing';
      }
    }

    // Vérifier les champs QR code par défaut
    if (data.default_presentation_video_public_url) {
      if (data.qr_code_default_presentation_video_public_url === 'to_compute') {
        fieldsToProcess.push('qr_code_default_presentation_video_public_url');
        updates.qr_code_default_presentation_video_public_url = 'computing';
      }
      if (data.qr_code_less_default_presentation_video_public_url === 'to_compute') {
        fieldsToProcess.push('qr_code_less_default_presentation_video_public_url');
        updates.qr_code_less_default_presentation_video_public_url = 'computing';
      }
    }

    // Mettre à jour les champs à "computing" si nécessaire
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseService.getSupabaseClient()
        .from(table)
        .update(updates)
        .eq('id', recordId);

      if (updateError) {
        console.error('❌ Erreur lors de la mise à jour des statuts:', updateError);
        return [];
      }

      console.log('✅ Statuts mis à jour vers "computing":', Object.keys(updates));
    }

    return fieldsToProcess;

  } catch (error) {
    console.error('❌ Erreur lors de la vérification des champs:', error);
    return [];
  }
}

// Démarrer le traitement si ce fichier est exécuté directement
if (require.main === module) {
  processVideoJob();
} 