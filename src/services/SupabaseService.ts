import { createClient } from '@supabase/supabase-js';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface SupabaseConfig {
  url: string;
  serviceKey: string;
  bucketName: string;
}

export class SupabaseService {
  private supabase;
  private bucketName: string;

  constructor() {
    const url = process.env['SUPABASE_URL'];
    const serviceKey = process.env['SUPABASE_SERVICE_KEY'];
    this.bucketName = process.env['SUPABASE_BUCKET_NAME'] || 'videos';

    if (!url || !serviceKey) {
      throw new Error('Configuration Supabase manquante: SUPABASE_URL et SUPABASE_SERVICE_KEY requis');
    }

    this.supabase = createClient(url, serviceKey);
  }

  async download(publicUrl: string, localPath: string): Promise<void> {
    try {
      // Extraire le chemin du fichier depuis l'URL publique
      const urlParts = publicUrl.split('/');
      const filePath = urlParts.slice(-2).join('/'); // Prend les 2 derniers segments

      console.log(`📥 Téléchargement de ${filePath} vers ${localPath}`);

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .download(filePath);

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

  async uploadVideo(localPath: string, fileName: string): Promise<string> {
    try {
      console.log(`📤 Upload de ${localPath} vers ${fileName}`);

      // Lire le fichier local
      const fileBuffer = await fs.readFile(localPath);

      // Upload vers Supabase
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
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
        .from(this.bucketName)
        .getPublicUrl(data.path);

      const publicUrl = publicUrlData.publicUrl;

      console.log(`✅ Fichier uploadé avec succès: ${publicUrl}`);

      return publicUrl;

    } catch (error) {
      console.error('❌ Erreur lors de l\'upload:', error);
      throw error;
    }
  }

  async deleteVideo(fileName: string): Promise<void> {
    try {
      console.log(`🗑️ Suppression de ${fileName}`);

      const { error } = await this.supabase.storage
        .from(this.bucketName)
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

  getPublicUrl(filePath: string, bucketName?: string): string {
    const targetBucket = bucketName || this.bucketName;
    const { data } = this.supabase.storage
      .from(targetBucket)
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  }

  async cleanupLocalFile(filePath: string): Promise<void> {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        console.log(`🧹 Fichier local supprimé: ${filePath}`);
      }
    } catch (error) {
      console.error(`❌ Erreur lors du nettoyage de ${filePath}:`, error);
    }
  }
} 