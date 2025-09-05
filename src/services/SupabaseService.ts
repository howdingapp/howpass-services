import { createClient } from '@supabase/supabase-js';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EmbeddingService } from './EmbeddingService';

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
  private embeddingService: EmbeddingService;

  constructor() {
    const url = process.env['SUPABASE_URL'];
    const serviceKey = process.env['SUPABASE_SERVICE_KEY'];

    if (!url || !serviceKey) {
      throw new Error('Configuration Supabase manquante: SUPABASE_URL et SUPABASE_SERVICE_KEY requis');
    }

    this.supabase = createClient(url, serviceKey);
    this.embeddingService = new EmbeddingService();
  }

  async download(bucketName: string, bucketPath: string, localPath: string): Promise<void> {
    try {
 
      console.log(`📥 Téléchargement de ${bucketName}/${bucketPath} vers ${localPath}`);

      // Vérifier d'abord si le fichier existe
      const fileName = bucketPath.split('/').pop();
      const { data: listData, error: listError } = await this.supabase.storage
        .from(bucketName)
        .list(bucketPath.split('/').slice(0, -1).join('/') || '', {
          search: fileName || ''
        });

      if (listError) {
        console.warn('⚠️ Impossible de lister les fichiers:', listError);
      } else {
        console.log('📋 Fichiers trouvés:', listData?.map(f => f.name));
      }

      const { data, error } = await this.supabase.storage
        .from(bucketName)
        .download(bucketPath);

      if (error) {
        console.error('❌ Erreur de téléchargement Supabase:', error);
        throw new Error(`Erreur lors du téléchargement: ${error.message || JSON.stringify(error)}`);
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

  /**
   * Recherche vectorielle par similarité sur une table donnée
   */
  async searchVectorSimilarity(
    table: string, 
    column: string, 
    query: string, 
    limit: number = 4
  ): Promise<any[]> {
    try {
      console.log(`🔍 Recherche vectorielle sur ${table}.${column} pour: "${query}"`);
      
      // Générer l'embedding pour la requête
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      console.log('Query params for vector search', {
        query_embedding: queryEmbedding?.slice(0, 10),
        table_name: table,
        match_threshold: 0,
        match_count: limit
      })

      // Utiliser la fonction spécifique selon la table
      let functionName: string;
      switch (table) {
        case 'practices':
          functionName = 'match_practices';
          break;
        case 'faq':
          functionName = 'match_faq';
          break;
        case 'user_data':
          functionName = 'match_user_data';
          break;
        case 'activities':
          functionName = 'match_activities';
          break;
        case 'categories':
          functionName = 'match_categories';
          break;
        default:
          throw new Error(`Table ${table} non supportée pour la recherche vectorielle`);
      }

      const { data, error } = await this.supabase
        .rpc(functionName, {
          query_embedding: queryEmbedding,
          match_threshold: 0.15,
          match_count: limit
        });

      if (error) {
        console.error(`❌ Erreur lors de la recherche vectorielle sur ${table}:`, error);
        
        // Fallback vers une recherche textuelle simple
        console.log(`🔄 Fallback vers recherche textuelle sur ${table}`);
        const { data: fallbackData, error: fallbackError } = await this.supabase
          .from(table)
          .select('*')
          .ilike(column, `%${query}%`)
          .limit(limit);

        if (fallbackError) {
          console.error(`❌ Erreur lors du fallback sur ${table}:`, fallbackError);
          return [];
        }

        return fallbackData || [];
      }

      console.log('🔍 Résultats de la recherche vectorielle:', data);

      return data || [];
    } catch (error) {
      console.error(`❌ Erreur inattendue lors de la recherche vectorielle sur ${table}:`, error);
      
      // Fallback vers une recherche textuelle en cas d'erreur d'embedding
      console.log(`🔄 Fallback vers recherche textuelle sur ${table} (erreur d'embedding)`);
      try {
        const { data: fallbackData, error: fallbackError } = await this.supabase
          .from(table)
          .select('*')
          .ilike(column, `%${query}%`)
          .limit(limit);

        if (fallbackError) {
          console.error(`❌ Erreur lors du fallback sur ${table}:`, fallbackError);
          return [];
        }

        return fallbackData || [];
      } catch (fallbackError) {
        console.error(`❌ Erreur lors du fallback final sur ${table}:`, fallbackError);
        return [];
      }
    }
  }

  /**
   * Diagnostiquer les données vectorielles
   */
  async diagnoseVectorData(): Promise<{
    success: boolean;
    data?: any[];
    error?: string;
  }> {
    try {
      console.log('🔍 Diagnostic des données vectorielles');

      const { data, error } = await this.supabase
        .rpc('diagnose_vector_data');

      if (error) {
        console.error('❌ Erreur lors du diagnostic des données vectorielles:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log('✅ Diagnostic des données vectorielles terminé:', data);
      return {
        success: true,
        data: data || []
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors du diagnostic des données vectorielles:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Recherche d'activités et pratiques avec recherche vectorielle
   */
  async searchActivitiesAndPractices(
    searchTerm: string,
  ): Promise<{
    results: any[];
    searchTerm: string;
    total: number;
  }> {
    try {
      console.log(`🔍 Recherche d'activités et pratiques pour: "${searchTerm}"`);
      
      // Recherche vectorielle sur les activités (4 meilleures)
      const activitiesResults = await this.searchVectorSimilarity(
        'activities',
        'vector_summary',
        searchTerm,
        4
      );
      
      // Recherche vectorielle sur les pratiques (4 meilleures)
      const practicesResults = await this.searchVectorSimilarity(
        'practices',
        'vector_summary',
        searchTerm,
        4
      );
      
      // Mapper les résultats pour ne retourner que les champs utiles à l'IA
      const mapActivity = (r: any) => {
        const relevanceScore = r?.similarity ?? 0.8;
        return {
          type: 'activity',
          id: r?.id,
          title: r?.title,
          shortDescription: r?.short_description,
          longDescription: r?.long_description,
          durationMinutes: r?.duration_minutes,
          participants: r?.participants,
          rating: r?.rating,
          price: r?.price,
          benefits: r?.benefits,
          typicalSituations: r?.typical_situations,
          locationType: r?.location_type,
          address: r?.address,
          selectedKeywords: r?.selected_keywords,
          relevanceScore
        };
      };

      const mapPractice = (r: any) => {
        const relevanceScore = r?.similarity ?? 0.8;
        return {
          type: 'practice',
          id: r?.id,
          title: r?.title,
          shortDescription: r?.short_description,
          longDescription: r?.long_description,
          benefits: r?.benefits,
          relevanceScore
        };
      };

      const activitiesWithType = (activitiesResults || []).map(mapActivity);
      const practicesWithType = (practicesResults || []).map(mapPractice);
      
      // Combiner les résultats (4 activités + 4 pratiques = 8 total)
      let combinedResults = [...activitiesWithType, ...practicesWithType];
      
      // Trier par score de pertinence
      combinedResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      return {
        results: combinedResults, // Retourner tous les résultats (max 8)
        searchTerm,
        total: combinedResults.length
      };
    } catch (error) {
      console.error(`❌ Erreur lors de la recherche d'activités et pratiques:`, error);
      return {
        results: [],
        searchTerm,
        total: 0
      };
    }
  }

  /**
   * Recherche vectorielle FAQ (sur la colonne vector_summary)
   */
  async searchFAQ(
    searchTerm: string,
    limit: number = 5
  ): Promise<{
    results: any[];
    searchTerm: string;
    total: number;
  }> {
    try {
      console.log(`🔍 Recherche FAQ pour: "${searchTerm}"`);

      const faqResults = await this.searchVectorSimilarity(
        'faq',
        'vector_summary',
        searchTerm,
        limit
      );

      const mapped = (faqResults || []).map((r: any) => ({
        type: 'faq',
        id: r?.id,
        question: r?.question,
        answer: r?.reponse,
        keywords: r?.keywords,
        typicalSituation: r?.typical_situation,
        faqType: r?.type,
        active: r?.active,
        relevanceScore: r?.similarity ?? 0.8
      }));

      // Tri décroissant selon pertinence
      mapped.sort((a: any, b: any) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

      return {
        results: mapped,
        searchTerm,
        total: mapped.length
      };
    } catch (error) {
      console.error(`❌ Erreur lors de la recherche FAQ:`, error);
      return {
        results: [],
        searchTerm,
        total: 0
      };
    }
  }
} 