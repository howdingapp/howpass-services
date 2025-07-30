import { createClient } from '@supabase/supabase-js';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export const VIDEO_BUCKET= "videos";
export const IMAGE_BUCKET= "images";
export const SOUND_BUCKET= "sounds";

export interface SupabaseConfig {
  url: string;
  serviceKey: string;
  bucketName: string;
}

export class SupabaseService {
  private supabase;

  constructor() {
    const url = process.env['SUPABASE_URL'];
    const serviceKey = process.env['SUPABASE_SERVICE_KEY'];

    if (!url || !serviceKey) {
      throw new Error('Configuration Supabase manquante: SUPABASE_URL et SUPABASE_SERVICE_KEY requis');
    }

    this.supabase = createClient(url, serviceKey);
  }

  async download(bucketName: string, bucketPath: string, localPath: string): Promise<void> {
    try {
 
      console.log(`📥 Téléchargement de ${bucketName}/${bucketPath} vers ${localPath}`);

      const { data, error } = await this.supabase.storage
        .from(bucketName)
        .download(bucketPath);

      if (error) {
        throw new Error(`Erreur lors du téléchargement: ${error.message}`);
        console.log(error)
      }

      if (!data) {
        throw new Error('Aucune donnée reçue lors du téléchargement');
      }

      // Créer le répertoire de destination s'il n'existe pas
      await fs.ensureDir(path.dirname(localPath));

      // Écrire le fichier localement
      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(localPath, buffer);

      console.log(`✅ Fichier téléchargé avec succès: ${localPath}`);

    } catch (error) {
      console.error('❌ Erreur lors du téléchargement:', error);
      throw error;
    }
  }

  async upload(bucketName: string, localPath: string, fileName: string): Promise<string> {
    try {
      console.log(`📤 Upload de ${localPath} vers ${fileName} dans ${bucketName}`);

      // Lire le fichier local
      const fileBuffer = await fs.readFile(localPath);

      // Upload vers Supabase
      const { data, error } = await this.supabase.storage
        .from(bucketName)
        .upload(fileName, fileBuffer, {
          contentType: 'video/mp4',
          upsert: true
        });

      if (error) {
        throw new Error(`Erreur lors de l'upload: ${error.message}`);
      }

      if (!data) {
        throw new Error('Aucune donnée reçue lors de l\'upload');
      }

      // Générer l'URL publique
      const { data: publicUrlData } = this.supabase.storage
        .from(bucketName)
        .getPublicUrl(data.path);

      const publicUrl = publicUrlData.publicUrl;

      console.log(`✅ Fichier uploadé avec succès: ${publicUrl}`);

      return publicUrl;

    } catch (error) {
      console.error('❌ Erreur lors de l\'upload:', error);
      throw error;
    }
  }

  async delete(bucketName: string, fileName: string): Promise<void> {
    try {
      console.log(`🗑️ Suppression de ${fileName}`);

      const { error } = await this.supabase.storage
        .from(bucketName)
        .remove([fileName]);

      if (error) {
        throw new Error(`Erreur lors de la suppression: ${error.message}`);
      }

      console.log(`✅ Fichier supprimé avec succès: ${fileName}`);

    } catch (error) {
      console.error('❌ Erreur lors de la suppression:', error);
      throw error;
    }
  }

  generateFileName(prefix: string = 'merged'): string {
    const timestamp = Date.now();
    const randomId = uuidv4().substring(0, 8);
    return `${prefix}_${timestamp}_${randomId}.mp4`;
  }

  getPublicUrl(filePath: string, bucketName: string): string {
    const { data } = this.supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  }

  async cleanupLocalFile(filePath: string): Promise<void> {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        console.log(`🗑️ Fichier local supprimé: ${filePath}`);
      }
    } catch (error) {
      console.error('❌ Erreur lors de la suppression du fichier local:', error);
    }
  }

  async updateQrCodePresentationVideoUrl(table: string, recordId: string | number, outputUrl: string): Promise<boolean> {
    try {
      console.log('📝 Mise à jour du champ qr_code_presentation_video_public_url:', { table, recordId, outputUrl });

      const { error } = await this.supabase
        .from(table)
        .update({ qr_code_presentation_video_public_url: outputUrl })
        .eq('id', recordId)
        .select();

      if (error) {
        console.error('❌ Erreur lors de la mise à jour:', error);
        return false;
      }

      console.log('✅ Champ qr_code_presentation_video_public_url mis à jour avec succès');
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour du champ qr_code_presentation_video_public_url:', error);
      return false;
    }
  }

  async updateQrCodePresentationVideoMidUrl(table: string, recordId: string | number, outputUrl: string): Promise<boolean> {
    try {
      console.log('📝 Mise à jour du champ qr_code_less_presentation_video_public_url:', { table, recordId, outputUrl });

      const { error } = await this.supabase
        .from(table)
        .update({ qr_code_less_presentation_video_public_url: outputUrl })
        .eq('id', recordId);

      if (error) {
        console.error('❌ Erreur lors de la mise à jour du champ qr_code_less_presentation_video_public_url:', error);
        return false;
      }

      console.log('✅ Champ qr_code_less_presentation_video_public_url mis à jour avec succès');
      return true;

    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour du champ qr_code_less_presentation_video_public_url:', error);
      return false;
    }
  }

  async updateQrCodeDefaultPresentationVideoUrl(table: string, recordId: string | number, outputUrl: string): Promise<boolean> {
    try {
      console.log('📝 Mise à jour du champ qr_code_default_presentation_video_public_url:', { table, recordId, outputUrl });

      const { error } = await this.supabase
        .from(table)
        .update({ qr_code_default_presentation_video_public_url: outputUrl })
        .eq('id', recordId);

      if (error) {
        console.error('❌ Erreur lors de la mise à jour du champ qr_code_default_presentation_video_public_url:', error);
        return false;
      }

      console.log('✅ Champ qr_code_default_presentation_video_public_url mis à jour avec succès');
      return true;

    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour du champ qr_code_default_presentation_video_public_url:', error);
      return false;
    }
  }

  async updateQrCodeLessDefaultPresentationVideoUrl(table: string, recordId: string | number, outputUrl: string): Promise<boolean> {
    try {
      console.log('📝 Mise à jour du champ qr_code_less_default_presentation_video_public_url:', { table, recordId, outputUrl });

      const { error } = await this.supabase
        .from(table)
        .update({ qr_code_less_default_presentation_video_public_url: outputUrl })
        .eq('id', recordId);

      if (error) {
        console.error('❌ Erreur lors de la mise à jour du champ qr_code_less_default_presentation_video_public_url:', error);
        return false;
      }

      console.log('✅ Champ qr_code_less_default_presentation_video_public_url mis à jour avec succès');
      return true;

    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour du champ qr_code_less_default_presentation_video_public_url:', error);
      return false;
    }
  }

  async checkQrCodeDefaultFields(table: string, recordId: string | number): Promise<{ hasDefaultVideo: boolean; hasDefaultLessVideo: boolean }> {
    try {
      console.log('🔍 Vérification des champs QR code par défaut:', { table, recordId });

      const { data, error } = await this.supabase
        .from(table)
        .select('qr_code_default_presentation_video_public_url, qr_code_less_default_presentation_video_public_url, default_presentation_video_public_url')
        .eq('id', recordId)
        .single();

      if (error) {
        console.error('❌ Erreur lors de la vérification des champs QR code par défaut:', error);
        return { hasDefaultVideo: false, hasDefaultLessVideo: false };
      }

      const hasDefaultVideo = data.qr_code_default_presentation_video_public_url === 'computing' && data.default_presentation_video_public_url;
      const hasDefaultLessVideo = data.qr_code_less_default_presentation_video_public_url === 'computing' && data.default_presentation_video_public_url;

      console.log('✅ Vérification des champs QR code par défaut terminée:', { hasDefaultVideo, hasDefaultLessVideo });
      return { hasDefaultVideo, hasDefaultLessVideo };

    } catch (error) {
      console.error('❌ Erreur lors de la vérification des champs QR code par défaut:', error);
      return { hasDefaultVideo: false, hasDefaultLessVideo: false };
    }
  }

  getSupabaseClient() {
    return this.supabase;
  }
} 