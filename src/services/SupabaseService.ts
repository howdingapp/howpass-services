import { createClient } from '@supabase/supabase-js';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EmbeddingService } from './EmbeddingService';
import { HowanaContext } from '../types/repositories';
import { sortSearchResultsBySimilarity } from '../utils/searchUtils';
import {
  SituationChunk,
  SearchPracticesBySituationChunksResponse,
  SearchActivitiesBySituationChunksResponse,
  SearchHowerAngelsByUserSituationResponse,
  PracticeSearchResult,
  ActivitySearchResult,
  HowerAngelSearchResult
} from '../types/search';

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
  next_response_id?: string | null;
  cost_input?: number | null; // Nombre de tokens input utilisés (non cached)
  cost_cached_input?: number | null; // Nombre de tokens input utilisés (cached)
  cost_output?: number | null; // Nombre de tokens output utilisés
  user_input_text?: string | null; // Message utilisateur qui a déclenché cette réponse
  metadata?: Record<string, any>;
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
    // Passer this pour éviter la dépendance circulaire
    this.embeddingService = new EmbeddingService(this);
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
    response_text?: string;
    metadata?: Record<string, any>;
    next_response_id?: string | null;
    message_type?: string; // Type de message (text, summary, etc.)
    cost_input?: number | null; // Nombre de tokens input utilisés (non cached)
    cost_cached_input?: number | null; // Nombre de tokens input utilisés (cached)
    cost_output?: number | null; // Nombre de tokens output utilisés
    user_input_text?: string | null; // Message utilisateur qui a déclenché cette réponse
    valid_for_limit?: boolean; // Indique si ce message compte dans la limite journalière
  }): Promise<{
    success: boolean;
    data?: AIResponse;
    error?: string;
  }> {
    try {
      console.log('🔍 Mise à jour de la réponse IA:', aiResponseId);

      const updatePayload: any = {};

      // Ajouter response_text si fourni
      if (updateData.response_text !== undefined) {
        updatePayload.response_text = updateData.response_text;
      }

      // Ajouter metadata si fourni
      if (updateData.metadata !== undefined) {
        updatePayload.metadata = updateData.metadata;
      }

      // Ajouter next_response_id si fourni
      if (updateData.next_response_id !== undefined) {
        updatePayload.next_response_id = updateData.next_response_id;
      }

      // Ajouter message_type si fourni
      if (updateData.message_type !== undefined) {
        updatePayload.message_type = updateData.message_type;
      }

      // Ajouter cost_input si fourni
      if (updateData.cost_input !== undefined) {
        updatePayload.cost_input = updateData.cost_input;
      }

      // Ajouter cost_cached_input si fourni
      if (updateData.cost_cached_input !== undefined) {
        updatePayload.cost_cached_input = updateData.cost_cached_input;
      }

      // Ajouter cost_output si fourni
      if (updateData.cost_output !== undefined) {
        updatePayload.cost_output = updateData.cost_output;
      }

      // Ajouter user_input_text si fourni
      if (updateData.user_input_text !== undefined) {
        updatePayload.user_input_text = updateData.user_input_text;
      }

      // Ajouter valid_for_limit si fourni
      if (updateData.valid_for_limit !== undefined) {
        updatePayload.valid_for_limit = updateData.valid_for_limit;
      }

      const { data, error } = await this.supabase
        .from('ai_responses')
        .update(updatePayload)
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
   * Récupérer le profil d'un utilisateur
   */
  async getUserProfil(userId: string): Promise<{
    success: boolean;
    profil?: string;
    error?: string;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('user_data')
        .select('profil')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('❌ Erreur lors de la récupération du profil utilisateur:', error);
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        profil: data?.profil || null
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la récupération du profil utilisateur:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Récupérer le rôle d'un utilisateur
   */
  async getUserRole(userId: string): Promise<{
    success: boolean;
    role?: string;
    error?: string;
  }> {
    try {
      const { data: roleData, error } = await this.supabase
        .from('user_roles')
        .select(`
          roles(name)
        `)
        .eq('user_id', userId);

      if (error) {
        console.error('❌ Erreur lors de la récupération du rôle utilisateur:', error);
        return {
          success: false,
          error: error.message
        };
      }

      const role = roleData && Array.isArray(roleData) && roleData.length > 0 
        ? ((roleData[0]?.roles ?? {}) as any).name || roleData[0]?.roles?.[0]?.name || undefined
        : undefined;

      return {
        success: true,
        role: role || null
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la récupération du rôle utilisateur:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Compter les messages valides créés aujourd'hui par un utilisateur
   * Les messages valides sont ceux avec valid_for_limit = true et qui ne proviennent pas de conversations de type 'activity'
   */
  async countTodayValidMessagesByUserId(userId: string): Promise<{
    success: boolean;
    count?: number;
    error?: string;
  }> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Récupérer d'abord les conversations qui ne sont pas de type 'activity'
      const { data: conversations, error: conversationsError } = await this.supabase
        .from('howana_conversations')
        .select('id')
        .eq('user_id', userId)
        .neq('conversation_type', 'activity');

      if (conversationsError) {
        console.error('❌ Erreur lors de la récupération des conversations valides:', conversationsError);
        return {
          success: false,
          error: conversationsError.message
        };
      }

      if (!conversations || conversations.length === 0) {
        return {
          success: true,
          count: 0
        };
      }

      const conversationIds = conversations.map(c => c.id);

      // Compter les messages valides pour ces conversations
      const { count, error } = await this.supabase
        .from('ai_responses')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('valid_for_limit', true)
        .in('conversation_id', conversationIds)
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString());

      if (error) {
        console.error('❌ Erreur lors du comptage des messages valides du jour:', error);
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        count: count || 0
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors du comptage des messages valides du jour:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Compter les messages valides créés aujourd'hui par un utilisateur pour les conversations de type 'recommandation'
   * Les messages valides sont ceux avec valid_for_limit = true
   */
  async countTodayValidRecommandationMessagesByUserId(userId: string): Promise<{
    success: boolean;
    count?: number;
    error?: string;
  }> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Récupérer d'abord les conversations de type 'recommandation'
      const { data: conversations, error: conversationsError } = await this.supabase
        .from('howana_conversations')
        .select('id')
        .eq('user_id', userId)
        .eq('conversation_type', 'recommandation');

      if (conversationsError) {
        console.error('❌ Erreur lors de la récupération des conversations de recommandation:', conversationsError);
        return {
          success: false,
          error: conversationsError.message
        };
      }

      if (!conversations || conversations.length === 0) {
        return {
          success: true,
          count: 0
        };
      }

      const conversationIds = conversations.map(c => c.id);

      // Compter les messages valides pour ces conversations
      const { count, error } = await this.supabase
        .from('ai_responses')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('valid_for_limit', true)
        .in('conversation_id', conversationIds)
        .gte('created_at', today.toISOString())
        .lt('created_at', tomorrow.toISOString());

      if (error) {
        console.error('❌ Erreur lors du comptage des messages valides de recommandation du jour:', error);
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        count: count || 0
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors du comptage des messages valides de recommandation du jour:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Compter les conversations de type bilan créées dans une période donnée
   * @param userId - ID de l'utilisateur
   * @param periodCount - Nombre de périodes (ex: 7 pour 7 jours)
   * @param periodType - Type de période: 'day', 'week', 'month' (depuis le début du mois courant), ou 'year' (depuis le début de l'année courante)
   * @param excludeConversationID - ID de la conversation à exclure du comptage (optionnel)
   */
  async countBilanConversationsByUserIdInPeriod(
    userId: string, 
    periodCount: number, 
    periodType: 'day' | 'week' | 'month' | 'year',
    excludeConversationID?: string
  ): Promise<{
    success: boolean;
    count?: number;
    error?: string;
  }> {
    try {
      const now = new Date();
      const startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);

      // Calculer la date de début selon le type de période
      if (periodType === 'day') {
        startDate.setDate(startDate.getDate() - periodCount);
      } else if (periodType === 'week') {
        startDate.setDate(startDate.getDate() - (periodCount * 7));
      } else if (periodType === 'month') {
        // Depuis le début du mois courant (ou les N derniers mois)
        // Début du mois il y a (periodCount - 1) mois
        startDate.setDate(1);
        startDate.setMonth(now.getMonth() - (periodCount - 1));
        startDate.setFullYear(now.getFullYear());
        // JavaScript gère automatiquement le changement d'année si le mois devient négatif
      } else { // year
        // Depuis le début de l'année courante (ou les N dernières années)
        // Début de l'année il y a (periodCount - 1) années
        startDate.setDate(1);
        startDate.setMonth(0); // Janvier
        startDate.setFullYear(now.getFullYear() - (periodCount - 1));
      }

      // Compter uniquement les conversations de type 'bilan' avec status 'completed'
      let query = this.supabase
        .from('howana_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('conversation_type', 'bilan')
        .eq('status', 'completed')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', now.toISOString());

      // Exclure la conversation actuelle si spécifiée
      if (excludeConversationID) {
        query = query.neq('id', excludeConversationID);
      }

      const { count, error } = await query;

      if (error) {
        const periodText = periodType === 'day' 
          ? `${periodCount} jour${periodCount > 1 ? 's' : ''}`
          : periodType === 'week'
          ? `${periodCount} semaine${periodCount > 1 ? 's' : ''}`
          : periodType === 'month'
          ? `${periodCount} mois`
          : `${periodCount} année${periodCount > 1 ? 's' : ''}`;
        console.error(`❌ Erreur lors du comptage des conversations bilan sur ${periodText}:`, error);
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        count: count || 0
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors du comptage des conversations bilan:', error);
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
    limit: number = 4,
    matchThreshold: number = 0.6
  ): Promise<any[]> {
    try {
      console.log(`🔍 Recherche vectorielle sur ${table}.${column} pour: "${query}"`);
      
      // Générer l'embedding pour la requête
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      
      // Calculer le nombre de chunks à rechercher (multiplicateur pour garantir assez de résultats uniques)
      const chunkSearchMultiplier = 8;
      const chunksToSearch = limit * chunkSearchMultiplier;
      
      console.log('Query params for vector search', {
        query_embedding: queryEmbedding?.slice(0, 10),
        query_text: query,
        table_name: table,
        requested_results: limit,
        vec_k: chunksToSearch,
        lex_k: chunksToSearch,
        rrf_k: 60,
        match_threshold: matchThreshold,
        note: 'Recherche hybride RRF (vector + BM25) avec sur-échantillonnage et seuil de précision'
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

      // Utiliser le nombre de chunks calculé plus haut pour garantir assez de résultats uniques
      // Avec le système de chunks, plusieurs chunks peuvent correspondre au même ID
      // On cherche 8x plus de chunks que le nombre de résultats désirés pour avoir
      // de meilleures chances d'obtenir le nombre de résultats uniques demandés

      const { data, error } = await this.supabase
        .rpc(functionName, {
          query_embedding: queryEmbedding,
          query_text: query, // Texte de recherche pour la partie BM25
          match_count: limit, // Nombre de résultats finaux désirés
          vec_k: chunksToSearch, // Sur-échantillonnage côté vecteur
          lex_k: chunksToSearch, // Sur-échantillonnage côté BM25
          rrf_k: 60, // Constante de lissage RRF
          match_threshold: matchThreshold // Seuil de similarité vectorielle minimale [0, 1]
        });

      if (error) {
        console.error(`❌ Erreur lors de la recherche vectorielle sur ${table}:`, error);
        return [];
      }

      console.log('🔍 Résultats de la recherche vectorielle:', data);

      // Limiter les résultats au nombre demandé (car on a recherché plus de chunks)
      const limitedResults = (data || []).slice(0, limit);
      
      if (limitedResults.length < (data || []).length) {
        console.log(`📊 ${(data || []).length} résultats trouvés, limités à ${limit} pour correspondre à la demande`);
      }

      return limitedResults;
    } catch (error) {
      console.error(`❌ Erreur inattendue lors de la recherche vectorielle sur ${table}:`, error);
      return [];
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
    situationChunks: string[],
    withMatchInfos: boolean = false
  ): Promise<{
    results: any[];
    searchTerm: string;
    total: number;
  }> {
    try {
      console.log(`🔍 Recherche d'activités et pratiques pour ${situationChunks.length} chunks de situation`);
      
      // Faire les appels en parallèle pour chaque chunk
      const searchPromises = situationChunks.map(chunk => 
        Promise.all([
          this.searchVectorSimilarity('activities', 'vector_summary', chunk, 4),
          this.searchVectorSimilarity('practices', 'vector_summary', chunk, 4)
        ])
      );
      
      const allResults = await Promise.all(searchPromises);
      
      // Combiner tous les résultats
      let activitiesResults: any[] = [];
      let practicesResults: any[] = [];
      
      allResults.forEach(([activities, practices]) => {
        activitiesResults = [...activitiesResults, ...(activities || [])];
        practicesResults = [...practicesResults, ...(practices || [])];
      });
      
      // Mapper les résultats pour ne retourner que les champs utiles à l'IA
      const mapActivity = (r: any) => {
        const relevanceScore = r?.similarity ?? 0.8;
        const result: any = {
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
          locationType: r?.location_type,
          address: r?.address,
          selectedKeywords: r?.selected_keywords,
          relevanceScore
        };
        if (withMatchInfos) {
          result.typicalSituations = r?.typical_situations;
        }
        return result;
      };

      const mapPractice = (r: any) => {
        const relevanceScore = r?.similarity ?? 0.8;
        const result: any = {
          type: 'practice',
          id: r?.id,
          title: r?.title,
          shortDescription: r?.short_description,
          longDescription: r?.long_description,
          benefits: r?.benefits,
          relevanceScore
        };
        if (withMatchInfos) {
          result.typicalSituations = r?.typical_situations;
        }
        return result;
      };

      const activitiesWithType = (activitiesResults || []).map(mapActivity);
      const practicesWithType = (practicesResults || []).map(mapPractice);
      
      // Combiner les résultats (4 activités + 4 pratiques = 8 total)
      let combinedResults = [...activitiesWithType, ...practicesWithType];
      
      // Trier par score de pertinence
      combinedResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      return {
        results: combinedResults, // Retourner tous les résultats
        searchTerm: situationChunks.join(' '),
        total: combinedResults.length
      };
    } catch (error) {
      console.error(`❌ Erreur lors de la recherche d'activités et pratiques:`, error);
      return {
        results: [],
        searchTerm: situationChunks.join(' '),
        total: 0
      };
    }
  }

  /**
   * Recherche uniquement des pratiques basée sur des chunks de situation
   */
  async searchPracticesBySituationChunks(
    situationChunks: SituationChunk[],
    withMatchInfos: boolean = false
  ): Promise<SearchPracticesBySituationChunksResponse> {
    try {
      console.log(`🔍 Recherche de pratiques pour ${situationChunks.length} chunks de situation`);
      
      // Faire les appels en parallèle pour chaque chunk avec une limite élevée et un seuil de similarité de 0.6
      // On utilise une limite très élevée (1000) pour récupérer toutes les pratiques disponibles
      const searchPromises = situationChunks.map(chunk => 
        this.searchVectorSimilarity('practices', 'vector_summary', chunk, 1000, 0.6)
      );
      
      const allResults = await Promise.all(searchPromises);
      
      // Combiner tous les résultats
      let practicesResults: any[] = [];
      allResults.forEach(practices => {
        practicesResults = [...practicesResults, ...(practices || [])];
      });
      
      console.log('🔍 Résultats de la recherche de pratiques:', practicesResults.length);

      // Mapper les résultats
      const mapPractice = (r: any): PracticeSearchResult => {
        const relevanceScore = r?.similarity ?? 0.8;
        const result: PracticeSearchResult = {
          type: 'practice',
          id: r?.id,
          title: r?.title,
          shortDescription: r?.short_description,
          longDescription: r?.long_description,
          benefits: r?.benefits,
          relevanceScore,
          similarity: relevanceScore,
          vectorSimilarity: r?.vector_similarity ?? null,
          bm25Similarity: r?.bm25_similarity ?? null,
          // Nouveaux champs : category et family
          categoryId: r?.category_id ?? null,
          categoryName: r?.category_name ?? null,
          categoryDescription: r?.category_description ?? null,
          familyId: r?.family_id ?? null,
          familyName: r?.family_name ?? null,
          familyDescription: r?.family_description ?? null
        };
        if (withMatchInfos) {
          result.typicalSituations = r?.typical_situations;
          result.chunkId = r?.chunk_id ?? null;
          result.chunkText = r?.chunk_text ?? null;
        }
        return result;
      };

      const practicesWithType = practicesResults.map(mapPractice);
      
      // Filtrer par similarité minimale de 0.6
      const filteredPractices = practicesWithType.filter(p => p.relevanceScore >= 0.6);
      
      // Compter les matchs par pratique et collecter les chunks et scores
      const practiceMatchCount = new Map<string, number>();
      const practiceChunks = new Map<string, Set<string>>(); // practiceId -> Set de chunks
      const practiceScores = new Map<string, Array<{ similarity: number; bm25Similarity: number | null; vectorSimilarity: number | null }>>(); // practiceId -> Array de scores
      
      filteredPractices.forEach((practice: any) => {
        const currentCount = practiceMatchCount.get(practice.id) || 0;
        practiceMatchCount.set(practice.id, currentCount + 1);
        
        // Collecter les chunks si disponibles
        if (withMatchInfos && practice.chunkText) {
          if (!practiceChunks.has(practice.id)) {
            practiceChunks.set(practice.id, new Set());
          }
          practiceChunks.get(practice.id)!.add(practice.chunkText);
        }
        
        // Collecter les scores
        if (!practiceScores.has(practice.id)) {
          practiceScores.set(practice.id, []);
        }
        practiceScores.get(practice.id)!.push({
          similarity: practice.similarity || practice.relevanceScore,
          bm25Similarity: practice.bm25Similarity,
          vectorSimilarity: practice.vectorSimilarity
        });
      });
      
      // Dédupliquer par ID en gardant le meilleur score et en ajoutant le matchCount, chunks et scores
      const practicesMap = new Map<string, any>();
      filteredPractices.forEach(practice => {
        const existing = practicesMap.get(practice.id);
        if (!existing || (practice.relevanceScore > existing.relevanceScore)) {
          practicesMap.set(practice.id, {
            ...practice,
            matchCount: practiceMatchCount.get(practice.id) || 1,
            chunks: Array.from(practiceChunks.get(practice.id) || []),
            matchScores: practiceScores.get(practice.id) || []
          });
        }
      });
      
      const practices = Array.from(practicesMap.values());
      
      // Trier par matchCount décroissant, puis par similarité si matchCount égal
      const sortedPractices = sortSearchResultsBySimilarity(practices);
      
      console.log('🔍 Résultats de la recherche de pratiques triés:', sortedPractices.length);

      return {
        results: sortedPractices,
        searchTerm: situationChunks.join(' '),
        total: sortedPractices.length
      };
    } catch (error) {
      console.error(`❌ Erreur lors de la recherche de pratiques:`, error);
      return {
        results: [],
        searchTerm: situationChunks.join(' '),
        total: 0
      };
    }
  }

  /**
   * Recherche uniquement des activités basée sur des chunks de situation
   */
  async searchActivitiesBySituationChunks(
    situationChunks: SituationChunk[],
    withMatchInfos: boolean = false
  ): Promise<SearchActivitiesBySituationChunksResponse> {
    try {
      console.log(`🔍 Recherche d'activités pour ${situationChunks.length} chunks de situation`);
      
      // Faire les appels en parallèle pour chaque chunk avec une limite élevée et un seuil de similarité de 0.6
      // On utilise une limite très élevée (1000) pour récupérer toutes les activités disponibles
      const searchPromises = situationChunks.map(chunk => 
        this.searchVectorSimilarity('activities', 'vector_summary', chunk, 1000, 0.6)
      );
      
      const allResults = await Promise.all(searchPromises);
      
      // Combiner tous les résultats
      let activitiesResults: any[] = [];
      allResults.forEach(activities => {
        activitiesResults = [...activitiesResults, ...(activities || [])];
      });
      
      // Mapper les résultats
      const mapActivity = (r: any): ActivitySearchResult => {
        const relevanceScore = r?.similarity ?? 0.8;
        const result: ActivitySearchResult = {
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
          locationType: r?.location_type,
          address: r?.address,
          selectedKeywords: r?.selected_keywords,
          relevanceScore,
          similarity: relevanceScore,
          vectorSimilarity: r?.vector_similarity ?? null,
          bm25Similarity: r?.bm25_similarity ?? null,
          // Nouveaux champs : practice -> category -> family
          practiceId: r?.practice_id ?? null,
          practiceTitle: r?.practice_title ?? null,
          practiceShortDescription: r?.practice_short_description ?? null,
          categoryId: r?.category_id ?? null,
          categoryName: r?.category_name ?? null,
          categoryDescription: r?.category_description ?? null,
          familyId: r?.family_id ?? null,
          familyName: r?.family_name ?? null,
          familyDescription: r?.family_description ?? null
        };
        if (withMatchInfos) {
          result.typicalSituations = r?.typical_situations;
          result.chunkId = r?.chunk_id ?? null;
          result.chunkText = r?.chunk_text ?? null;
        }
        return result;
      };

      const activitiesWithType = activitiesResults.map(mapActivity);
      
      // Filtrer par similarité minimale de 0.6
      const filteredActivities = activitiesWithType.filter(a => a.relevanceScore >= 0.6);
      
      // Compter les matchs par activité et collecter les chunks et scores
      const activityMatchCount = new Map<string, number>();
      const activityChunks = new Map<string, Set<string>>(); // activityId -> Set de chunks
      const activityScores = new Map<string, Array<{ similarity: number; bm25Similarity: number | null; vectorSimilarity: number | null }>>(); // activityId -> Array de scores
      
      filteredActivities.forEach((activity: any) => {
        const currentCount = activityMatchCount.get(activity.id) || 0;
        activityMatchCount.set(activity.id, currentCount + 1);
        
        // Collecter les chunks si disponibles
        if (withMatchInfos && activity.chunkText) {
          if (!activityChunks.has(activity.id)) {
            activityChunks.set(activity.id, new Set());
          }
          activityChunks.get(activity.id)!.add(activity.chunkText);
        }
        
        // Collecter les scores
        if (!activityScores.has(activity.id)) {
          activityScores.set(activity.id, []);
        }
        activityScores.get(activity.id)!.push({
          similarity: activity.similarity || activity.relevanceScore,
          bm25Similarity: activity.bm25Similarity,
          vectorSimilarity: activity.vectorSimilarity
        });
      });
      
      // Dédupliquer par ID en gardant le meilleur score et en ajoutant le matchCount, chunks et scores
      const activitiesMap = new Map<string, any>();
      filteredActivities.forEach(activity => {
        const existing = activitiesMap.get(activity.id);
        if (!existing || (activity.relevanceScore > existing.relevanceScore)) {
          activitiesMap.set(activity.id, {
            ...activity,
            matchCount: activityMatchCount.get(activity.id) || 1,
            chunks: Array.from(activityChunks.get(activity.id) || []),
            matchScores: activityScores.get(activity.id) || []
          });
        }
      });
      
      const activities = Array.from(activitiesMap.values());
      
      // Trier par matchCount décroissant, puis par similarité si matchCount égal
      const sortedActivities = sortSearchResultsBySimilarity(activities);
      
      console.log('🔍 Résultats de la recherche d\'activités triés:', sortedActivities.length);
      
      return {
        results: sortedActivities,
        searchTerm: situationChunks.join(' '),
        total: sortedActivities.length
      };
    } catch (error) {
      console.error(`❌ Erreur lors de la recherche d'activités:`, error);
      return {
        results: [],
        searchTerm: situationChunks.join(' '),
        total: 0
      };
    }
  }

  /**
   * Recherche vectorielle FAQ (sur la colonne vector_summary)
   */
  async searchFAQ(
    searchTerm: string,
    limit: number = 5,
    withMatchInfos: boolean = false
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

      const mapped = (faqResults || []).map((r: any) => {
        const result: any = {
          type: 'faq',
          id: r?.id,
          question: r?.question,
          answer: r?.reponse,
          keywords: r?.keywords,
          faqType: r?.type,
          active: r?.active,
          relevanceScore: r?.similarity ?? 0.8
        };
        if (withMatchInfos) {
          result.typicalSituation = r?.typical_situation;
        }
        return result;
      });

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

  /**
   * Récupérer les 5 dernières activités de l'utilisateur
   */
  async getLastUserActivities(
    userId: string,
    limit: number = 5
  ): Promise<{
    success: boolean;
    data?: Array<{
      id: string;
      title: string;
      shortDescription?: string;
      longDescription?: string;
      durationMinutes?: number;
      participants?: number;
      rating?: number;
      price?: number;
      benefits?: any;
      locationType?: string;
      address?: any;
      selectedKeywords?: any;
      presentationImagePublicUrl?: string;
      presentationVideoPublicUrl?: string;
      status: string;
      date: string;
      hour: number;
      minute: number;
      createdAt: string;
    }>;
    error?: string;
  }> {
    try {
      console.log(`🔍 Récupération des ${limit} dernières activités pour l'utilisateur: ${userId}`);

      const { data, error } = await this.supabase
        .from('user_rendezvous')
        .select(`
          status,
          created_at,
          rendezvous!inner(
            id,
            date,
            hour,
            minute,
            activity_id,
            activities!inner(
              id,
              title,
              short_description,
              long_description,
              duration_minutes,
              participants,
              rating,
              price,
              benefits,
              location_type,
              address,
              selected_keywords,
              presentation_image_public_url,
              presentation_video_public_url,
              created_at
            )
          )
        `)
        .eq('user_id', userId)
        .in('status', ['accepted', 'paid', 'done'])
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Erreur lors de la récupération des dernières activités:', error);
        return {
          success: false,
          error: error.message
        };
      }

      // Mapper les données pour un format plus simple
      const mappedData = (data || []).map((item: any) => {
        const rendezvous = item.rendezvous;
        const activity = rendezvous?.activities;
        
        return {
          id: activity?.id,
          title: activity?.title,
          shortDescription: activity?.short_description,
          longDescription: activity?.long_description,
          durationMinutes: activity?.duration_minutes,
          participants: activity?.participants,
          rating: activity?.rating,
          price: activity?.price,
          benefits: activity?.benefits,
          locationType: activity?.location_type,
          address: activity?.address,
          selectedKeywords: activity?.selected_keywords,
          presentationImagePublicUrl: activity?.presentation_image_public_url,
          presentationVideoPublicUrl: activity?.presentation_video_public_url,
          status: item.status,
          date: rendezvous?.date,
          hour: rendezvous?.hour,
          minute: rendezvous?.minute,
          createdAt: item.created_at
        };
      }).filter(item => item.id); // Filtrer les éléments sans ID d'activité

      console.log(`✅ ${mappedData.length} dernières activités récupérées pour l'utilisateur ${userId}`);
      
      return {
        success: true,
        data: mappedData
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la récupération des dernières activités:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Récupérer le contexte d'une conversation Howana
   */
  async getContext(conversationId: string): Promise<HowanaContext | null> {
    try {
      console.log(`🔍 Récupération du contexte pour la conversation: ${conversationId}`);

      const { data: conversation, error } = await this.supabase
        .from('howana_conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (error) {
        console.error('❌ Erreur lors de la récupération de la conversation:', error);
        return null;
      }

      if (!conversation) {
        console.log('⚠️ Conversation non trouvée:', conversationId);
        return null;
      }

      // Vérifier si la conversation est active
      if (conversation.status !== 'active') {
        console.log('⚠️ Conversation non active:', conversationId, 'status:', conversation.status);
        return null;
      }

      // Retourner le contexte stocké dans la conversation
      return conversation.context as HowanaContext;

    } catch (error) {
      console.error('❌ Erreur lors de la récupération du contexte:', error);
      return null;
    }
  }

  /**
   * Récupérer les règles IA spécifiques au type de conversation
   */
  async getIARules(conversationType: string): Promise<{
    success: boolean;
    data?: any[];
    error?: string;
  }> {
    try {
      console.log(`📋 Récupération des règles IA pour le type: ${conversationType}`);

      const { data: iaRules, error } = await this.supabase
        .from('ia_rules')
        .select('*')
        .eq('type', conversationType)
        .eq('is_active', true)
        .order('priority', { ascending: true });

      if (error) {
        console.error('❌ Erreur lors de la récupération des règles IA:', error);
        return {
          success: false,
          error: error.message
        };
      }

      // Transformer les données de snake_case vers camelCase
      const transformedRules = (iaRules || []).map(rule => ({
        id: rule.id,
        type: rule.type,
        name: rule.name,
        description: rule.description,
        priority: rule.priority,
        isActive: rule.is_active,
        createdAt: new Date(rule.created_at),
        updatedAt: new Date(rule.updated_at)
      }));

      console.log(`✅ ${transformedRules.length} règles IA récupérées pour le type: ${conversationType}`);
      return {
        success: true,
        data: transformedRules
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la récupération des règles IA:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Mettre à jour le contexte d'une conversation Howana
   */
  async updateContext(conversationId: string, context: HowanaContext): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`📝 Mise à jour du contexte pour la conversation: ${conversationId}`);

      const { error } = await this.supabase
        .from('howana_conversations')
        .update({ 
          context: context,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (error) {
        console.error('❌ Erreur lors de la mise à jour du contexte:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log(`✅ Contexte mis à jour avec succès pour la conversation: ${conversationId}`);
      return {
        success: true
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la mise à jour du contexte:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Mettre à jour le total_cost d'une conversation (somme des tokens)
   * @param conversationId ID de la conversation
   * @param tokensToAdd Nombre de tokens à ajouter au total_cost existant
   */
  async updateConversationTotalCost(conversationId: string, tokensToAdd: number): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`💰 Mise à jour du total_cost pour la conversation: ${conversationId}, tokens à ajouter: ${tokensToAdd}`);

      // Récupérer le total_cost actuel
      const { data: conversation, error: fetchError } = await this.supabase
        .from('howana_conversations')
        .select('total_cost')
        .eq('id', conversationId)
        .single();

      if (fetchError) {
        console.error('❌ Erreur lors de la récupération de la conversation:', fetchError);
        return {
          success: false,
          error: fetchError.message
        };
      }

      const currentTotalCost = conversation?.total_cost || 0;
      const newTotalCost = currentTotalCost + tokensToAdd;

      // Mettre à jour le total_cost
      const { error } = await this.supabase
        .from('howana_conversations')
        .update({ 
          total_cost: newTotalCost,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (error) {
        console.error('❌ Erreur lors de la mise à jour du total_cost:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log(`✅ Total_cost mis à jour: ${currentTotalCost} + ${tokensToAdd} = ${newTotalCost}`);
      return {
        success: true
      };
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour du total_cost:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  }

  /**
   * Mettre à jour le compute_time d'une conversation (temps de traitement cumulé)
   * @param conversationId ID de la conversation
   * @param timeToAdd Temps en secondes à ajouter au compute_time
   */
  async updateConversationComputeTime(conversationId: string, timeToAdd: number): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`⏱️ Mise à jour du compute_time pour la conversation: ${conversationId}, temps à ajouter: ${timeToAdd}s`);

      // Récupérer le compute_time actuel
      const { data: conversation, error: fetchError } = await this.supabase
        .from('howana_conversations')
        .select('compute_time')
        .eq('id', conversationId)
        .single();

      if (fetchError) {
        console.error('❌ Erreur lors de la récupération de la conversation:', fetchError);
        return {
          success: false,
          error: fetchError.message
        };
      }

      const currentComputeTime = conversation?.compute_time || 0;
      const newComputeTime = currentComputeTime + timeToAdd;

      // Mettre à jour le compute_time
      const { error } = await this.supabase
        .from('howana_conversations')
        .update({ 
          compute_time: newComputeTime,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (error) {
        console.error('❌ Erreur lors de la mise à jour du compute_time:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log(`✅ Compute_time mis à jour: ${currentComputeTime}s + ${timeToAdd}s = ${newComputeTime}s`);
      return {
        success: true
      };
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour du compute_time:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  }

  /**
   * Mettre à jour le status d'une conversation
   * @param conversationId ID de la conversation
   * @param status Nouveau status ('active' | 'completed' | 'expired')
   */
  async updateConversationStatus(conversationId: string, status: 'active' | 'completed' | 'expired'): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`🔄 Mise à jour du status de la conversation: ${conversationId} -> ${status}`);

      const { error } = await this.supabase
        .from('howana_conversations')
        .update({ 
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (error) {
        console.error('❌ Erreur lors de la mise à jour du status:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log(`✅ Status de la conversation mis à jour: ${status}`);
      return {
        success: true
      };
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour du status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  }

  /**
   * Met à jour l'intent de la conversation
   * @param conversationId ID de la conversation
   * @param intent L'intent calculé à sauvegarder
   * @returns Résultat de la mise à jour
   */
  async updateIntent(conversationId: string, intent: any): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`🎯 Mise à jour de l'intent pour la conversation: ${conversationId}`);

      const { error } = await this.supabase
        .from('howana_conversations')
        .update({ 
          intent: intent,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (error) {
        console.error('❌ Erreur lors de la mise à jour de l\'intent:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log(`✅ Intent mis à jour avec succès pour la conversation: ${conversationId}`);
      return {
        success: true
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la mise à jour de l\'intent:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Fonction centralisée pour finaliser une tâche IA
   * Met à jour le contexte et la réponse IA en une seule opération
   */
  async onTaskFinish(
    conversationId: string, 
    updatedContext: HowanaContext, 
    iaResponse: any, 
    aiResponseId?: string
  ): Promise<{
    success: boolean;
    contextUpdated: boolean;
    aiResponseUpdated: boolean;
    error?: string;
  }> {
    try {
      console.log(`🎯 Finalisation de la tâche IA pour la conversation: ${conversationId}`);

      // Mettre à jour le contexte
      const contextUpdateResult = await this.updateContext(conversationId, updatedContext);
      if (!contextUpdateResult.success) {
        console.error('❌ Erreur lors de la mise à jour du contexte:', contextUpdateResult.error);
        return {
          success: false,
          contextUpdated: false,
          aiResponseUpdated: false,
          error: `Erreur contexte: ${contextUpdateResult.error}`
        };
      }

      // Mettre à jour la réponse IA si un ID est fourni
      let aiResponseUpdated = false;
      if (aiResponseId) {
        const aiResponseUpdateResult = await this.updateAIResponse(aiResponseId, {
          response_text: typeof iaResponse === 'string' ? iaResponse : JSON.stringify(iaResponse),
          metadata: iaResponse.metadata || {}
        });

        if (!aiResponseUpdateResult.success) {
          console.error('❌ Erreur lors de la mise à jour de la réponse IA:', aiResponseUpdateResult.error);
          return {
            success: false,
            contextUpdated: true,
            aiResponseUpdated: false,
            error: `Erreur aiResponse: ${aiResponseUpdateResult.error}`
          };
        }
        aiResponseUpdated = true;
        console.log(`✅ Réponse IA mise à jour: ${aiResponseId}`);
      } else {
        console.warn(`⚠️ Aucun aiResponseId fourni pour la conversation: ${conversationId}`);
      }

      console.log(`✅ Tâche IA finalisée avec succès pour: ${conversationId}`);
      return {
        success: true,
        contextUpdated: true,
        aiResponseUpdated: aiResponseUpdated
      };

    } catch (error) {
      console.error('❌ Erreur inattendue lors de la finalisation de la tâche IA:', error);
      return {
        success: false,
        contextUpdated: false,
        aiResponseUpdated: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Récupérer toutes les pratiques disponibles
   */
  async getAllAvailablePractices(): Promise<{
    success: boolean;
    data?: Array<{
      id: string;
      title: string;
    }>;
    error?: string;
  }> {
    try {
      console.log(`🔍 Récupération de toutes les pratiques disponibles`);

      const { data, error } = await this.supabase
        .from('practices')
        .select(`
          id,
          title
        `)
        .eq('is_active', true);

      if (error) {
        console.error('❌ Erreur lors de la récupération des pratiques:', error);
        return {
          success: false,
          error: error.message
        };
      }

      const practices = (data || []).map((practice: any) => ({
        id: practice.id,
        title: practice.title,
      }));

      console.log(`✅ ${practices.length} pratiques récupérées`);
      return {
        success: true,
        data: practices
      };

    } catch (error) {
      console.error('❌ Erreur lors de la récupération des pratiques:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Recherche vectorielle des hower angels par situation utilisateur
   * Utilise match_user_data pour récupérer les données enrichies (activités, spécialités transformées)
   */
  async searchHowerAngelsByUserSituation(
    situationChunks: SituationChunk[],
    limit: number = 2,
    withMatchInfos: boolean = false
  ): Promise<SearchHowerAngelsByUserSituationResponse> {
    try {
      console.log(`🔍 Recherche de hower angels pour ${situationChunks.length} chunks de situation`);

      // Faire les appels en parallèle pour chaque chunk en utilisant directement match_user_data
      const searchPromises = situationChunks.map(async (chunk) => {
        // Générer l'embedding pour la requête
        const queryEmbedding = await this.embeddingService.generateEmbedding(chunk);
        
        // Appeler directement match_user_data via RPC pour récupérer les données enrichies
        const { data, error } = await this.supabase
          .rpc('match_user_data', {
            query_embedding: queryEmbedding,
            query_text: chunk, // Texte de recherche pour la partie BM25
            match_count: limit * 2, // Chercher plus de résultats pour avoir assez après déduplication
            vec_k: (limit * 2) * 8, // Sur-échantillonnage côté vecteur
            lex_k: (limit * 2) * 8, // Sur-échantillonnage côté BM25
            rrf_k: 60, // Constante de lissage RRF
            match_threshold: 0.0 // Seuil de similarité vectorielle minimale (0 = pas de filtre)
          });

        if (error) {
          console.error(`❌ Erreur lors de l'appel à match_user_data pour le chunk "${chunk}":`, error);
          return [];
        }

        return data || [];
      });
      
      const allResults = await Promise.all(searchPromises);
      
      // Combiner tous les résultats
      let howerAngelsResults: any[] = [];
      allResults.forEach(results => {
        howerAngelsResults = [...howerAngelsResults, ...(results || [])];
      });

      // Compter les matchs par hower angel et collecter les chunks et scores
      const howerAngelMatchCount = new Map<string, number>();
      const howerAngelChunks = new Map<string, Set<string>>(); // howerAngelId -> Set de chunks
      const howerAngelScores = new Map<string, Array<{ similarity: number; bm25Similarity: number | null; vectorSimilarity: number | null }>>(); // howerAngelId -> Array de scores
      
      howerAngelsResults.forEach((user: any) => {
        const currentCount = howerAngelMatchCount.get(user.id) || 0;
        howerAngelMatchCount.set(user.id, currentCount + 1);
        
        // Collecter les chunks si disponibles
        if (withMatchInfos && user.chunk_text) {
          if (!howerAngelChunks.has(user.id)) {
            howerAngelChunks.set(user.id, new Set());
          }
          howerAngelChunks.get(user.id)!.add(user.chunk_text);
        }
        
        // Collecter les scores
        if (!howerAngelScores.has(user.id)) {
          howerAngelScores.set(user.id, []);
        }
        howerAngelScores.get(user.id)!.push({
          similarity: user.similarity || 0,
          bm25Similarity: user.bm25_similarity ?? null,
          vectorSimilarity: user.vector_similarity ?? null
        });
      });

      // Dédupliquer par ID en gardant le meilleur score de similarité et en ajoutant le matchCount, chunks et scores
      const uniqueHowerAngels = new Map<string, any>();
      howerAngelsResults.forEach((user: any) => {
        const existing = uniqueHowerAngels.get(user.id);
        if (!existing || (user.similarity > existing.similarity)) {
          uniqueHowerAngels.set(user.id, {
            ...user,
            matchCount: howerAngelMatchCount.get(user.id) || 1,
            chunks: Array.from(howerAngelChunks.get(user.id) || []),
            matchScores: howerAngelScores.get(user.id) || []
          });
        }
      });

      // Mapper les résultats avec les données enrichies de match_user_data
      const howerAngels = Array.from(uniqueHowerAngels.values())
        .map((user: any): HowerAngelSearchResult => {
          const result: HowerAngelSearchResult = {
            id: user.id,
            userId: user.user_id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            specialties: user.specialties || [], // Tableau d'objets {id, title, short_description} depuis match_user_data
            experience: user.experience,
            vectorSimilarity: user?.vector_similarity ?? null,
            bm25Similarity: user?.bm25_similarity ?? null,
            profile: user.profil,
            activities: (user.activities || []).map((activity: any) => ({
              id: activity.id,
              title: activity.title,
              shortDescription: activity.short_description,
              longDescription: activity.long_description,
              durationMinutes: activity.duration_minutes,
              participants: activity.participants,
              rating: activity.rating,
              price: activity.price,
              benefits: activity.benefits,
              locationType: activity.location_type,
              address: activity.address,
              selectedKeywords: activity.selected_keywords,
              presentationImagePublicUrl: activity.presentation_image_public_url,
              presentationVideoPublicUrl: activity.presentation_video_public_url,
              status: activity.status,
              isActive: activity.is_active
            })),
            relevanceScore: user.similarity,
            similarity: user.similarity,
            matchCount: user.matchCount,
            chunks: user.chunks || [],
            matchScores: user.matchScores || []
          };
          if (withMatchInfos) {
            result.typicalSituations = user.typical_situations;
            result.chunkId = user?.chunk_id ?? null;
            result.chunkText = user?.chunk_text ?? null;
          }
          return result;
        });

      // Trier par matchCount décroissant, puis par similarité si matchCount égal
      const sortedHowerAngels = sortSearchResultsBySimilarity(howerAngels);

      console.log('🔍 Résultats de la recherche de hower angels triés:', sortedHowerAngels.length);

      // Limiter au nombre demandé
      const limitedResults = sortedHowerAngels.slice(0, limit);

      console.log(`✅ ${limitedResults.length} hower angels trouvés`);

      return {
        success: true,
        data: limitedResults,
        searchTerm: situationChunks.join(' '),
        total: limitedResults.length
      };

    } catch (error) {
      console.error('❌ Erreur lors de la recherche de hower angels:', error);
      return {
        success: false,
        data: [],
        searchTerm: situationChunks.join(' '),
        total: 0,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Recherche un embedding existant dans user_search par texte
   */
  async findEmbeddingByText(text: string): Promise<{ id: string; text: string; vector: number[] | null; created_at: string; updated_at: string } | null> {
    try {
      const { data, error } = await this.supabase
        .from('user_search')
        .select('id, text, vector, created_at, updated_at')
        .eq('text', text)
        .single();

      if (error) {
        // Si l'erreur est "PGRST116" (aucun résultat), retourner null
        if (error.code === 'PGRST116') {
          return null;
        }
        console.error('Erreur lors de la recherche d\'embedding:', error);
        return null;
      }

      return data as { id: string; text: string; vector: number[] | null; created_at: string; updated_at: string } | null;
    } catch (error) {
      console.error('Erreur lors de la recherche d\'embedding:', error);
      return null;
    }
  }

  /**
   * Crée ou met à jour un enregistrement dans user_search
   */
  async upsertEmbedding(text: string, vector: number[]): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('user_search')
        .upsert(
          {
            text,
            vector
          },
          {
            onConflict: 'text',
            ignoreDuplicates: false
          }
        );

      if (error) {
        console.error('Erreur lors de la sauvegarde d\'embedding:', error);
        // Ne pas throw pour ne pas bloquer le processus si la sauvegarde échoue
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde d\'embedding:', error);
      // Ne pas throw pour ne pas bloquer le processus si la sauvegarde échoue
    }
  }

  /**
   * Récupère toutes les familles disponibles
   */
  async getAllFamilies(): Promise<{
    success: boolean;
    data?: Array<{ id: string; name: string }>;
    error?: string;
  }> {
    try {
      console.log(`🔍 Récupération de toutes les familles`);

      const { data, error } = await this.supabase
        .from('families')
        .select('id, name')
        .eq('is_active', true);

      if (error) {
        console.error('❌ Erreur lors de la récupération des familles:', error);
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
      console.error('❌ Erreur inattendue lors de la récupération des familles:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }

  /**
   * Récupère toutes les familles par leurs IDs en une seule requête
   * Utilise getAllFamilies et filtre par IDs
   */
  async getFamiliesByIds(familyIds: string[]): Promise<{
    success: boolean;
    data?: Array<{ id: string; name: string }>;
    error?: string;
  }> {
    try {
      if (!familyIds || familyIds.length === 0) {
        return {
          success: true,
          data: []
        };
      }

      console.log(`🔍 Récupération de ${familyIds.length} familles par leurs IDs`);

      // Utiliser getAllFamilies et filtrer par IDs
      const allFamiliesResult = await this.getAllFamilies();
      
      if (!allFamiliesResult.success) {
        return {
          success: false,
          error: allFamiliesResult.error || 'Erreur lors de la récupération des familles'
        };
      }

      // Filtrer les familles par les IDs demandés
      const familyIdsSet = new Set(familyIds);
      const filteredFamilies = (allFamiliesResult.data || []).filter(family => 
        familyIdsSet.has(family.id)
      );

      return {
        success: true,
        data: filteredFamilies
      };
    } catch (error) {
      console.error('❌ Erreur inattendue lors de la récupération des familles:', error);
      return {
        success: false,
        error: 'Erreur interne du service'
      };
    }
  }
} 