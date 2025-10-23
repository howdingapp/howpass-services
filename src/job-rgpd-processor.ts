import { RgpdService } from './services/RgpdService';
import { EmailService } from './services/EmailService';
import { SupabaseService } from './services/SupabaseService';
import { RgpdJobPayload, RgpdJobResult } from './types/rgpd';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Charger les variables d'environnement
dotenv.config();

async function processRgpdJob() {
  try {
    console.log('📊 Démarrage du traitement RGPD...');

    // Récupérer les paramètres depuis les variables d'environnement
    const rgpdRequestStr = process.env['RGPD_REQUEST'];
    const requestId = process.env['REQUEST_ID'];
    const userId = process.env['USER_ID'];
    const requestType = process.env['REQUEST_TYPE'];
    const email = process.env['EMAIL'];

    if (!rgpdRequestStr || !requestId || !userId || !requestType || !email) {
      throw new Error('Variables d\'environnement manquantes: RGPD_REQUEST, REQUEST_ID, USER_ID, REQUEST_TYPE, EMAIL');
    }

    const rgpdRequest: RgpdJobPayload = JSON.parse(rgpdRequestStr);

    console.log('📊 Paramètres du job RGPD:', {
      requestId,
      userId,
      requestType,
      email
    });

    // Initialiser les services
    const rgpdService = new RgpdService();
    const emailService = new EmailService();
    const supabaseService = new SupabaseService();

    let result: RgpdJobResult;

    // Traiter selon le type de demande
    switch (requestType) {
      case 'data_export':
        result = await processDataExport(rgpdService, emailService, supabaseService, rgpdRequest);
        break;
      case 'data_deletion':
        result = await processDataDeletion(rgpdService, emailService, supabaseService, rgpdRequest);
        break;
      case 'data_portability':
        result = await processDataPortability(rgpdService, emailService, supabaseService, rgpdRequest);
        break;
      default:
        throw new Error(`Type de demande non supporté: ${requestType}`);
    }

    // Mettre à jour le statut de la demande
    await updateRequestStatus(supabaseService, requestId, result);

    if (result.success) {
      console.log('✅ Traitement RGPD terminé avec succès:', result);
      process.exit(0);
    } else {
      console.error('❌ Échec du traitement RGPD:', result.error);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Erreur lors du traitement RGPD:', error);
    process.exit(1);
  }
}

/**
 * Traite une demande d'export de données
 */
async function processDataExport(
  rgpdService: RgpdService,
  emailService: EmailService,
  supabaseService: SupabaseService,
  request: RgpdJobPayload
): Promise<RgpdJobResult> {
  try {
    console.log(`📤 Début de l'export des données pour l'utilisateur: ${request.userId}`);

    // Récupérer toutes les données de l'utilisateur
    const userData = await rgpdService.exportUserData(request.userId);

    if (!userData) {
      return {
        success: false,
        requestId: request.requestId,
        userId: request.userId,
        requestType: request.requestType,
        error: 'Utilisateur non trouvé ou données inaccessibles',
        processedAt: new Date().toISOString()
      };
    }

    // Créer le fichier d'export
    const exportData = JSON.stringify(userData, null, 2);
    const fileName = `export_${request.userId}_${Date.now()}.json`;
    const filePath = path.join('/tmp', fileName);

    // Écrire le fichier d'export
    fs.writeFileSync(filePath, exportData, 'utf8');

    // Uploader le fichier vers Supabase Storage avec sécurité avancée
    const downloadUrl = await uploadExportFile(supabaseService, filePath, fileName, request.userId);

    // Envoyer l'email avec le lien de téléchargement
    const htmlContent = emailService.generateDataExportEmailHtml(request.email, downloadUrl);
    const emailData = {
      to: request.email,
      subject: 'Export de vos données personnelles - HowPass',
      htmlContent: htmlContent,
      attachments: [{
        filename: fileName,
        content: Buffer.from(exportData),
        contentType: 'application/json'
      }]
    };

    const emailSent = await emailService.sendRgpdEmail(emailData);

    if (!emailSent) {
      console.warn('⚠️ Échec de l\'envoi de l\'email, mais l\'export est disponible');
    }

    // Nettoyer le fichier temporaire
    fs.unlinkSync(filePath);

    return {
      success: true,
      requestId: request.requestId,
      userId: request.userId,
      requestType: request.requestType,
      downloadUrl: downloadUrl,
      processedAt: new Date().toISOString(),
      dataSize: userData.metadata.dataSize
    };

  } catch (error) {
    console.error('❌ Erreur lors de l\'export des données:', error);
    return {
      success: false,
      requestId: request.requestId,
      userId: request.userId,
      requestType: request.requestType,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      processedAt: new Date().toISOString()
    };
  }
}

/**
 * Traite une demande de suppression de données
 */
async function processDataDeletion(
  rgpdService: RgpdService,
  emailService: EmailService,
  _supabaseService: SupabaseService,
  request: RgpdJobPayload
): Promise<RgpdJobResult> {
  try {
    console.log(`🗑️ Début de la suppression des données pour l'utilisateur: ${request.userId}`);

    // Supprimer toutes les données de l'utilisateur
    const deletionSuccess = await rgpdService.deleteUserData(request.userId);

    if (!deletionSuccess) {
      return {
        success: false,
        requestId: request.requestId,
        userId: request.userId,
        requestType: request.requestType,
        error: 'Échec de la suppression des données',
        processedAt: new Date().toISOString()
      };
    }

    // Envoyer l'email de confirmation
    const htmlContent = emailService.generateDataDeletionConfirmationEmailHtml(request.email);
    const emailData = {
      to: request.email,
      subject: 'Confirmation de suppression de vos données - HowPass',
      htmlContent: htmlContent
    };

    const emailSent = await emailService.sendRgpdEmail(emailData);

    if (!emailSent) {
      console.warn('⚠️ Échec de l\'envoi de l\'email de confirmation');
    }

    return {
      success: true,
      requestId: request.requestId,
      userId: request.userId,
      requestType: request.requestType,
      processedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Erreur lors de la suppression des données:', error);
    return {
      success: false,
      requestId: request.requestId,
      userId: request.userId,
      requestType: request.requestType,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      processedAt: new Date().toISOString()
    };
  }
}

/**
 * Traite une demande de portabilité des données
 */
async function processDataPortability(
  rgpdService: RgpdService,
  emailService: EmailService,
  supabaseService: SupabaseService,
  request: RgpdJobPayload
): Promise<RgpdJobResult> {
  try {
    console.log(`📦 Début de la portabilité des données pour l'utilisateur: ${request.userId}`);

    // Pour la portabilité, on fait la même chose que l'export mais avec un format standardisé
    const userData = await rgpdService.exportUserData(request.userId);

    if (!userData) {
      return {
        success: false,
        requestId: request.requestId,
        userId: request.userId,
        requestType: request.requestType,
        error: 'Utilisateur non trouvé ou données inaccessibles',
        processedAt: new Date().toISOString()
      };
    }

    // Convertir au format de portabilité (JSON standardisé)
    const portableData = convertToPortableFormat(userData);
    const fileName = `portability_${request.userId}_${Date.now()}.json`;
    const filePath = path.join('/tmp', fileName);

    // Écrire le fichier de portabilité
    fs.writeFileSync(filePath, JSON.stringify(portableData, null, 2), 'utf8');

    // Uploader le fichier avec sécurité avancée
    const downloadUrl = await uploadExportFile(supabaseService, filePath, fileName, request.userId);

    // Envoyer l'email
    const htmlContent = emailService.generateDataExportEmailHtml(request.email, downloadUrl);
    const emailData = {
      to: request.email,
      subject: 'Portabilité de vos données - HowPass',
      htmlContent: htmlContent,
      attachments: [{
        filename: fileName,
        content: Buffer.from(JSON.stringify(portableData, null, 2)),
        contentType: 'application/json'
      }]
    };

    const emailSent = await emailService.sendRgpdEmail(emailData);

    if (!emailSent) {
      console.warn('⚠️ Échec de l\'envoi de l\'email, mais la portabilité est disponible');
    }

    // Nettoyer le fichier temporaire
    fs.unlinkSync(filePath);

    return {
      success: true,
      requestId: request.requestId,
      userId: request.userId,
      requestType: request.requestType,
      downloadUrl: downloadUrl,
      processedAt: new Date().toISOString(),
      dataSize: userData.metadata.dataSize
    };

  } catch (error) {
    console.error('❌ Erreur lors de la portabilité des données:', error);
    return {
      success: false,
      requestId: request.requestId,
      userId: request.userId,
      requestType: request.requestType,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      processedAt: new Date().toISOString()
    };
  }
}

/**
 * Convertit les données au format de portabilité standard
 */
function convertToPortableFormat(userData: any): any {
  return {
    export_info: {
      format: 'GDPR Data Portability',
      version: '1.0',
      export_date: userData.metadata.exportDate,
      service: 'HowPass',
      user_id: userData.userId
    },
    personal_data: userData.personalInfo,
    conversations: userData.conversations,
    media: {
      videos: userData.videos,
      images: userData.images,
      sounds: userData.sounds
    },
    content: {
      bilans: userData.bilans
    },
    statistics: userData.metadata
  };
}

/**
 * Upload un fichier d'export vers le stockage avec sécurité avancée
 */
async function uploadExportFile(supabaseService: SupabaseService, filePath: string, _fileName: string, userId: string): Promise<string> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    
    // 1. Créer un nom de fichier sécurisé avec timestamp et hash aléatoire
    const timestamp = Date.now();
    const randomHash = Math.random().toString(36).substring(2, 15);
    const secureFileName = `export_${userId}_${timestamp}_${randomHash}.json`;
    
    // 2. Structure de dossiers sécurisée par utilisateur
    const secureFilePath = `users/${userId}/exports/${secureFileName}`;
    
    // 3. Uploader le fichier
    const { error } = await supabaseService.getSupabaseClient().storage
      .from('rgpd-exports')
      .upload(secureFilePath, fileBuffer, {
        contentType: 'application/json',
        cacheControl: '3600',
        upsert: false // Empêcher l'écrasement
      });

    if (error) {
      console.error('❌ Erreur lors de l\'upload du fichier:', error);
      throw error;
    }

    // 4. Créer une URL signée avec expiration (7 jours)
    const expiresIn = 7 * 24 * 60 * 60; // 7 jours en secondes
    const { data: signedUrlData, error: signedUrlError } = await supabaseService.getSupabaseClient().storage
      .from('rgpd-exports')
      .createSignedUrl(secureFilePath, expiresIn, {
        download: true
      });

    if (signedUrlError) {
      console.error('❌ Erreur lors de la création de l\'URL signée:', signedUrlError);
      throw signedUrlError;
    }

    // 5. Programmer la suppression automatique du fichier après 7 jours
    await scheduleFileDeletion(supabaseService, secureFilePath, 7);

    console.log(`✅ Fichier sécurisé uploadé: ${secureFilePath}`);
    console.log(`🔗 URL signée générée (expire dans 7 jours)`);

    return signedUrlData.signedUrl;

  } catch (error) {
    console.error('❌ Erreur lors de l\'upload sécurisé:', error);
    throw error;
  }
}

/**
 * Programme la suppression automatique d'un fichier
 */
async function scheduleFileDeletion(supabaseService: SupabaseService, filePath: string, daysToExpire: number): Promise<void> {
  try {
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + daysToExpire);
    
    // Insérer une tâche de suppression dans la base de données
    const { error } = await supabaseService.getSupabaseClient()
      .from('file_deletion_queue')
      .insert({
        file_path: filePath,
        deletion_date: deletionDate.toISOString(),
        status: 'pending',
        created_at: new Date().toISOString()
      });

    if (error) {
      console.warn('⚠️ Impossible de programmer la suppression automatique:', error);
    } else {
      console.log(`📅 Suppression automatique programmée pour ${filePath} le ${deletionDate.toISOString()}`);
    }
  } catch (error) {
    console.warn('⚠️ Erreur lors de la programmation de la suppression:', error);
  }
}

/**
 * Met à jour le statut de la demande RGPD
 */
async function updateRequestStatus(supabaseService: SupabaseService, requestId: string, result: RgpdJobResult): Promise<void> {
  try {
    const updateData: any = {
      status: result.success ? 'completed' : 'failed',
      processed_at: result.processedAt
    };

    if (result.success) {
      if (result.downloadUrl) {
        updateData.download_url = result.downloadUrl;
      }
    }
    // Note: Les erreurs sont loggées dans les logs, pas stockées en base

    const { error } = await supabaseService.getSupabaseClient()
      .from('gprd_requests')
      .update(updateData)
      .eq('id', requestId);

    if (error) {
      console.error('❌ Erreur lors de la mise à jour du statut:', error);
    } else {
      console.log('✅ Statut de la demande mis à jour:', updateData);
    }

  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour du statut:', error);
  }
}

// Démarrer le traitement si ce fichier est exécuté directement
if (require.main === module) {
  processRgpdJob();
}
