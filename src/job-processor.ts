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

    console.log('📊 Paramètres du job:', {
      table,
      recordId,
      mergeRequest: mergeRequestStr
    });

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

    // Récupérer les champs QR code ET les vidéos de présentation
    const { data, error } = await supabaseService.getSupabaseClient()
      .from(table)
      .select('qr_code_presentation_video_public_url, qr_code_less_presentation_video_public_url, presentation_video_public_url, default_presentation_video_public_url')
      .eq('id', recordId)
      .single();

    if (error) {
      console.error('❌ Erreur lors de la récupération des champs:', error);
      return [];
    }

    const fieldsToProcess: string[] = [];
    const updates: any = {};

    // Vérifier les champs QR code en 'to_compute'
    const presentationVideoUrl = (data as any).presentation_video_public_url;
    
    // Définir les champs QR code à traiter
    const qrCodeFields = [
      { field: 'qr_code_presentation_video_public_url', value: (data as any).qr_code_presentation_video_public_url },
      { field: 'qr_code_less_presentation_video_public_url', value: (data as any).qr_code_less_presentation_video_public_url }
    ];

    // Traiter chaque champ QR code
    for (const { field, value } of qrCodeFields) {
      if (value === 'to_compute') {
        if (!presentationVideoUrl) {
          console.log(`⚠️ ${field} est en to_compute mais presentation_video_public_url n'est pas renseigné, mise à jour vers null`);
          updates[field] = null;
        } else {
          console.log(`✅ ${field} est en to_compute et presentation_video_public_url est renseigné, passage à computing`);
          fieldsToProcess.push(field);
          updates[field] = 'computing';
        }
      } else {
        console.log(`ℹ️ ${field} n'est pas en 'to_compute' (valeur: ${value})`);
      }
    }

    // Mettre à jour la base de données si nécessaire
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseService.getSupabaseClient()
        .from(table)
        .update(updates)
        .eq('id', recordId);

      if (updateError) {
        console.error('❌ Erreur lors de la mise à jour des statuts:', updateError);
        return [];
      }

      const computingFields = Object.keys(updates).filter(field => updates[field] === 'computing');
      const nullFields = Object.keys(updates).filter(field => updates[field] === null);
      
      if (computingFields.length > 0) {
        console.log('✅ Statuts mis à jour vers "computing":', computingFields);
      }
      if (nullFields.length > 0) {
        console.log('✅ Champs mis à jour vers null:', nullFields);
      }
    } else {
      console.log('ℹ️ Aucun champ à mettre à jour');
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