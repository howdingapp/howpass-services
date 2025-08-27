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

export interface AIResponse {
  id?: string;
  conversation_id: string;
  user_id: string;
  response_text: string;
  message_type: string;
  created_at?: string;
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

  async updateRecord(table: string, recordId: string | number, updates: Record<string, any>): Promise<boolean> {
    try {
      console.log('📝 Mise à jour du record:', { table, recordId, updates });

      const { error } = await this.supabase
        .from(table)
        .update(updates)
        .eq('id', recordId);

      if (error) {
        console.error('❌ Erreur lors de la mise à jour du record:', error);
        return false;
      }

      console.log('✅ Record mis à jour avec succès:', Object.keys(updates));
      return true;
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour du record:', error);
      return false;
    }
  }

  getSupabaseClient() {
    return this.supabase;
  }

  /**
   * Enregistrer une réponse IA dans la table ai_responses
   */
  async createAIResponse(response: AIResponse): Promise<{
    success: boolean;
    data?: AIResponse;
    error?: string;
  }> {
    try {

      console.log('🔍 Création de la réponse IA:', response);

      const { data, error } = await this.supabase
        .from('ai_responses')
        .insert([response])
        .select()
        .single();

      if (error) {
        console.error('❌ Erreur lors de la création de la réponse IA:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log(`✅ Réponse IA enregistrée avec succès: ${data.id}`);
      return {
        success: true,
        data
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la création de la réponse IA:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Mettre à jour une réponse IA existante
   */
  async updateAIResponse(aiResponseId: string, updateData: {
    response_text: string;
    metadata?: Record<string, any>;
  }): Promise<{
    success: boolean;
    data?: AIResponse;
    error?: string;
  }> {
    try {
      console.log('🔍 Mise à jour de la réponse IA:', aiResponseId);

      const { data, error } = await this.supabase
        .from('ai_responses')
        .update({
          response_text: updateData.response_text,
          metadata: updateData.metadata || {},
        })
        .eq('id', aiResponseId)
        .select()
        .single();

      if (error) {
        console.error('❌ Erreur lors de la mise à jour de la réponse IA:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log(`✅ Réponse IA mise à jour avec succès: ${aiResponseId}`);
      return {
        success: true,
        data
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la mise à jour de la réponse IA:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Récupérer toutes les réponses IA d'une conversation
   */
  async getAIResponsesByConversation(conversationId: string): Promise<{
    success: boolean;
    data?: AIResponse[];
    error?: string;
  }> {
    try {

      console.log('🔍 Récupération des réponses IA pour la conversation:', conversationId);

      const { data, error } = await this.supabase
        .from('ai_responses')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Erreur lors de la récupération des réponses IA:', error);
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        data: data || []
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la récupération des réponses IA:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Mettre à jour le résumé IA d'un bilan
   */
  async updateBilanAISummary(bilanId: string, aiSummary: any): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      console.log('🔍 Mise à jour du résumé IA du bilan:', bilanId);

      const { data, error } = await this.supabase
        .from('bilans')
        .update({ 
          ai_summary: aiSummary,
          updated_at: new Date().toISOString()
        })
        .eq('id', bilanId)
        .select()
        .single();

      if (error) {
        console.error('❌ Erreur lors de la mise à jour du résumé IA du bilan:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log(`✅ Résumé IA du bilan mis à jour avec succès: ${bilanId}`);
      return {
        success: true,
        data
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la mise à jour du résumé IA du bilan:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Mettre à jour le résumé IA d'une activité
   */
  async updateActivityAISummary(activityId: string, aiSummary: any): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      console.log('🔍 Mise à jour du résumé IA de l\'activité:', activityId);

      const { data, error } = await this.supabase
        .from('activities')
        .update({ 
          ai_summary: aiSummary,
          updated_at: new Date().toISOString()
        })
        .eq('id', activityId)
        .select()
        .single();

      if (error) {
        console.error('❌ Erreur lors de la mise à jour du résumé IA de l\'activité:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log(`✅ Résumé IA de l'activité mis à jour avec succès: ${activityId}`);
      return {
        success: true,
        data
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la mise à jour du résumé IA de l\'activité:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Récupérer toutes les réponses IA d'un utilisateur
   */
  async getAIResponsesByUser(userId: string): Promise<{
    success: boolean;
    data?: AIResponse[];
    error?: string;
  }> {
    try {

      console.log('🔍 Récupération des réponses IA pour l\'utilisateur:', userId);

      const { data, error } = await this.supabase
        .from('ai_responses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Erreur lors de la récupération des réponses IA:', error);
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        data: data || []
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la récupération des réponses IA:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Supprimer une réponse IA
   */
  async deleteAIResponse(responseId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {

      console.log('🗑️ Suppression de la réponse IA:', responseId);

      const { error } = await this.supabase
        .from('ai_responses')
        .delete()
        .eq('id', responseId);

      if (error) {
        console.error('❌ Erreur lors de la suppression de la réponse IA:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log(`✅ Réponse IA supprimée avec succès: ${responseId}`);
      return {
        success: true
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la suppression de la réponse IA:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Supprimer toutes les réponses IA d'une conversation
   */
  async deleteAIResponsesByConversation(conversationId: string): Promise<{
    success: boolean;
    deletedCount?: number;
    error?: string;
  }> {
    try {

      console.log('🗑️ Suppression des réponses IA pour la conversation:', conversationId);

      const { data, error } = await this.supabase
        .from('ai_responses')
        .delete()
        .eq('conversation_id', conversationId)
        .select('id');

      if (error) {
        console.error('❌ Erreur lors de la suppression des réponses IA:', error);
        return {
          success: false,
          error: error.message
        };
      }

      const deletedCount = data?.length || 0;
      console.log(`✅ ${deletedCount} réponses IA supprimées pour la conversation: ${conversationId}`);
      
      return {
        success: true,
        deletedCount
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la suppression des réponses IA:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Vérifier la connexion à Supabase
   */
  async testConnection(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const { error } = await this.supabase
        .from('ai_responses')
        .select('count')
        .limit(1);

      if (error) {
        console.error('❌ Erreur de connexion à Supabase:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log('✅ Connexion à Supabase réussie');
      return {
        success: true
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors du test de connexion:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Récupérer toutes les activités
   */
  async getActivities(): Promise<{
    data: Array<{
      id: string;
      title: string;
      short_description?: string;
      long_description?: string;
      category_id: string;
      tags?: string[];
    }> | null;
    error?: any;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('activities')
        .select('id, title, short_description, long_description, category_id, tags');

      if (error) {
        console.error('❌ Erreur lors de la récupération des activités:', error);
        return { data: null, error };
      }

      return { data };
    } catch (error) {
      console.error('❌ Erreur inattendue lors de la récupération des activités:', error);
      return { data: null, error };
    }
  }

  /**
   * Récupérer toutes les pratiques
   */
  async getPractices(): Promise<{
    data: Array<{
      id: string;
      title: string;
      short_description?: string;
      long_description?: string;
      category_id: string;
      tags?: string[];
    }> | null;
    error?: any;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('practices')
        .select('id, title, short_description, long_description, category_id, tags');

      if (error) {
        console.error('❌ Erreur lors de la récupération des pratiques:', error);
        return { data: null, error };
      }

      return { data };
    } catch (error) {
      console.error('❌ Erreur inattendue lors de la récupération des pratiques:', error);
      return { data: null, error };
    }
  }
} 