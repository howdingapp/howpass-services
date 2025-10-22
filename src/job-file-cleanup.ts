import { SupabaseService } from './services/SupabaseService';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

/**
 * Job de nettoyage automatique des fichiers RGPD expirés
 */
async function cleanupExpiredFiles() {
  try {
    console.log('🧹 Démarrage du nettoyage des fichiers RGPD expirés...');

    const supabaseService = new SupabaseService();
    const supabase = supabaseService.getSupabaseClient();

    // Récupérer les fichiers à supprimer
    const { data: filesToDelete, error: fetchError } = await supabase
      .from('file_deletion_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('deletion_date', new Date().toISOString());

    if (fetchError) {
      console.error('❌ Erreur lors de la récupération des fichiers à supprimer:', fetchError);
      return;
    }

    if (!filesToDelete || filesToDelete.length === 0) {
      console.log('✅ Aucun fichier à supprimer');
      return;
    }

    console.log(`📋 ${filesToDelete.length} fichier(s) à supprimer`);

    let successCount = 0;
    let errorCount = 0;

    // Supprimer chaque fichier
    for (const fileRecord of filesToDelete) {
      try {
        console.log(`🗑️ Suppression de: ${fileRecord.file_path}`);

        // Supprimer le fichier du storage
        const { error: deleteError } = await supabase.storage
          .from('rgpd-exports')
          .remove([fileRecord.file_path]);

        if (deleteError) {
          console.error(`❌ Erreur lors de la suppression de ${fileRecord.file_path}:`, deleteError);
          
          // Marquer comme erreur si le fichier n'existe plus
          if (deleteError.message.includes('not found')) {
            console.log(`ℹ️ Fichier déjà supprimé: ${fileRecord.file_path}`);
            await markFileAsDeleted(supabase, fileRecord.id);
            successCount++;
          } else {
            errorCount++;
          }
        } else {
          // Marquer comme supprimé dans la base de données
          await markFileAsDeleted(supabase, fileRecord.id);
          successCount++;
          console.log(`✅ Fichier supprimé: ${fileRecord.file_path}`);
        }

      } catch (error) {
        console.error(`❌ Erreur lors du traitement de ${fileRecord.file_path}:`, error);
        errorCount++;
      }
    }

    console.log(`🎯 Nettoyage terminé: ${successCount} succès, ${errorCount} erreurs`);

  } catch (error) {
    console.error('❌ Erreur lors du nettoyage des fichiers:', error);
    process.exit(1);
  }
}

/**
 * Marque un fichier comme supprimé dans la base de données
 */
async function markFileAsDeleted(supabase: any, fileId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('file_deletion_queue')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString()
      })
      .eq('id', fileId);

    if (error) {
      console.error('❌ Erreur lors de la mise à jour du statut:', error);
    }
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour du statut:', error);
  }
}

/**
 * Nettoie les anciens enregistrements de la queue de suppression
 */
async function cleanupOldRecords() {
  try {
    console.log('🧹 Nettoyage des anciens enregistrements...');

    const supabaseService = new SupabaseService();
    const supabase = supabaseService.getSupabaseClient();

    // Supprimer les enregistrements de plus de 30 jours
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { error } = await supabase
      .from('file_deletion_queue')
      .delete()
      .eq('status', 'deleted')
      .lt('deleted_at', thirtyDaysAgo.toISOString());

    if (error) {
      console.error('❌ Erreur lors du nettoyage des anciens enregistrements:', error);
    } else {
      console.log('✅ Anciens enregistrements nettoyés');
    }

  } catch (error) {
    console.error('❌ Erreur lors du nettoyage des anciens enregistrements:', error);
  }
}

// Exécuter le nettoyage si ce fichier est appelé directement
if (require.main === module) {
  cleanupExpiredFiles()
    .then(() => cleanupOldRecords())
    .then(() => {
      console.log('✅ Nettoyage complet terminé');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erreur lors du nettoyage:', error);
      process.exit(1);
    });
}

export { cleanupExpiredFiles, cleanupOldRecords };
