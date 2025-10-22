import { SupabaseService } from './SupabaseService';
import { UserDataExport } from '../types/rgpd';

export class RgpdService {
  private supabaseService: SupabaseService;

  constructor() {
    this.supabaseService = new SupabaseService();
  }

  /**
   * Récupère toutes les données d'un utilisateur pour l'export RGPD
   */
  async exportUserData(userId: string): Promise<UserDataExport | null> {
    try {
      console.log(`📊 Début de l'export des données pour l'utilisateur: ${userId}`);

      // Récupérer les informations personnelles
      const personalInfo = await this.getPersonalInfo(userId);
      if (!personalInfo) {
        console.error(`❌ Utilisateur non trouvé: ${userId}`);
        return null;
      }

      // Récupérer les conversations
      const conversations = await this.getUserConversations(userId);

      // Récupérer les vidéos
      const videos = await this.getUserVideos(userId);

      // Récupérer les images
      const images = await this.getUserImages(userId);

      // Récupérer les sons
      const sounds = await this.getUserSounds(userId);

      // Récupérer les bilans
      const bilans = await this.getUserBilans(userId);

      // Calculer les métadonnées
      const metadata = this.calculateMetadata(conversations, videos, images, sounds, bilans);

      const userDataExport: UserDataExport = {
        userId,
        personalInfo,
        conversations,
        videos,
        images,
        sounds,
        bilans,
        metadata
      };

      console.log(`✅ Export des données terminé pour l'utilisateur: ${userId}`);
      return userDataExport;

    } catch (error) {
      console.error(`❌ Erreur lors de l'export des données pour l'utilisateur ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Supprime toutes les données d'un utilisateur
   */
  async deleteUserData(userId: string): Promise<boolean> {
    try {
      console.log(`🗑️ Début de la suppression des données pour l'utilisateur: ${userId}`);

      // Supprimer les conversations et messages
      await this.deleteUserConversations(userId);

      // Supprimer les médias (vidéos, images, sons)
      await this.deleteUserMedia(userId);

      // Supprimer les bilans
      await this.deleteUserBilans(userId);

      // Marquer l'utilisateur comme supprimé (soft delete)
      await this.markUserAsDeleted(userId);

      console.log(`✅ Suppression des données terminée pour l'utilisateur: ${userId}`);
      return true;

    } catch (error) {
      console.error(`❌ Erreur lors de la suppression des données pour l'utilisateur ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Récupère les informations personnelles de l'utilisateur
   */
  private async getPersonalInfo(userId: string): Promise<UserDataExport['personalInfo'] | null> {
    const { data, error } = await this.supabaseService.getSupabaseClient()
      .from('users')
      .select('id, email, first_name, last_name, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  /**
   * Récupère les conversations de l'utilisateur
   */
  private async getUserConversations(userId: string): Promise<UserDataExport['conversations']> {
    const { data, error } = await this.supabaseService.getSupabaseClient()
      .from('conversations')
      .select(`
        id,
        title,
        created_at,
        updated_at,
        messages (
          id,
          content,
          message_type,
          created_at
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('Erreur lors de la récupération des conversations:', error);
      return [];
    }

    return data.map(conv => ({
      id: conv.id,
      title: conv.title,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      messages: conv.messages?.map(msg => ({
        id: msg.id,
        content: msg.content,
        messageType: msg.message_type,
        createdAt: msg.created_at
      })) || []
    }));
  }

  /**
   * Récupère les vidéos de l'utilisateur
   */
  private async getUserVideos(userId: string): Promise<UserDataExport['videos']> {
    const { data, error } = await this.supabaseService.getSupabaseClient()
      .from('videos')
      .select('id, title, description, created_at, updated_at, file_path, duration')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('Erreur lors de la récupération des vidéos:', error);
      return [];
    }

    return data.map(video => ({
      id: video.id,
      title: video.title,
      description: video.description,
      createdAt: video.created_at,
      updatedAt: video.updated_at,
      filePath: video.file_path,
      duration: video.duration
    }));
  }

  /**
   * Récupère les images de l'utilisateur
   */
  private async getUserImages(userId: string): Promise<UserDataExport['images']> {
    const { data, error } = await this.supabaseService.getSupabaseClient()
      .from('images')
      .select('id, title, description, created_at, updated_at, file_path')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('Erreur lors de la récupération des images:', error);
      return [];
    }

    return data.map(image => ({
      id: image.id,
      title: image.title,
      description: image.description,
      createdAt: image.created_at,
      updatedAt: image.updated_at,
      filePath: image.file_path
    }));
  }

  /**
   * Récupère les sons de l'utilisateur
   */
  private async getUserSounds(userId: string): Promise<UserDataExport['sounds']> {
    const { data, error } = await this.supabaseService.getSupabaseClient()
      .from('sounds')
      .select('id, title, description, created_at, updated_at, file_path, duration')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('Erreur lors de la récupération des sons:', error);
      return [];
    }

    return data.map(sound => ({
      id: sound.id,
      title: sound.title,
      description: sound.description,
      createdAt: sound.created_at,
      updatedAt: sound.updated_at,
      filePath: sound.file_path,
      duration: sound.duration
    }));
  }

  /**
   * Récupère les bilans de l'utilisateur
   */
  private async getUserBilans(userId: string): Promise<UserDataExport['bilans']> {
    const { data, error } = await this.supabaseService.getSupabaseClient()
      .from('bilans')
      .select('id, title, content, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('Erreur lors de la récupération des bilans:', error);
      return [];
    }

    return data.map(bilan => ({
      id: bilan.id,
      title: bilan.title,
      content: bilan.content,
      createdAt: bilan.created_at,
      updatedAt: bilan.updated_at
    }));
  }

  /**
   * Calcule les métadonnées de l'export
   */
  private calculateMetadata(
    conversations: UserDataExport['conversations'],
    videos: UserDataExport['videos'],
    images: UserDataExport['images'],
    sounds: UserDataExport['sounds'],
    bilans: UserDataExport['bilans']
  ): UserDataExport['metadata'] {
    const dataSize = this.calculateDataSize(conversations, videos, images, sounds, bilans);

    return {
      totalConversations: conversations.length,
      totalVideos: videos.length,
      totalImages: images.length,
      totalSounds: sounds.length,
      totalBilans: bilans.length,
      exportDate: new Date().toISOString(),
      dataSize: `${dataSize} MB`
    };
  }

  /**
   * Calcule la taille approximative des données
   */
  private calculateDataSize(
    conversations: UserDataExport['conversations'],
    videos: UserDataExport['videos'],
    images: UserDataExport['images'],
    sounds: UserDataExport['sounds'],
    bilans: UserDataExport['bilans']
  ): number {
    // Estimation approximative de la taille des données
    const conversationSize = conversations.reduce((acc, conv) => {
      return acc + conv.messages.reduce((msgAcc, msg) => msgAcc + msg.content.length, 0);
    }, 0);

    const bilanSize = bilans.reduce((acc, bilan) => acc + bilan.content.length, 0);

    // Estimation pour les médias (très approximative)
    const mediaSize = (videos.length * 50) + (images.length * 2) + (sounds.length * 10);

    const totalBytes = conversationSize + bilanSize + mediaSize;
    return Math.round(totalBytes / (1024 * 1024) * 100) / 100; // Conversion en MB
  }

  /**
   * Supprime les conversations de l'utilisateur
   */
  private async deleteUserConversations(userId: string): Promise<void> {
    // Récupérer d'abord les IDs des conversations de l'utilisateur
    const { data: conversations } = await this.supabaseService.getSupabaseClient()
      .from('conversations')
      .select('id')
      .eq('user_id', userId);

    if (conversations && conversations.length > 0) {
      const conversationIds = conversations.map(conv => conv.id);
      
      // Supprimer les messages d'abord (contrainte de clé étrangère)
      const { error: messagesError } = await this.supabaseService.getSupabaseClient()
        .from('messages')
        .delete()
        .in('conversation_id', conversationIds);

      if (messagesError) {
        console.error('Erreur lors de la suppression des messages:', messagesError);
      }
    }

    // Supprimer les conversations
    const { error: conversationsError } = await this.supabaseService.getSupabaseClient()
      .from('conversations')
      .delete()
      .eq('user_id', userId);

    if (conversationsError) {
      console.error('Erreur lors de la suppression des conversations:', conversationsError);
    }
  }

  /**
   * Supprime les médias de l'utilisateur
   */
  private async deleteUserMedia(userId: string): Promise<void> {
    // Supprimer les vidéos
    const { error: videosError } = await this.supabaseService.getSupabaseClient()
      .from('videos')
      .delete()
      .eq('user_id', userId);

    if (videosError) {
      console.error('Erreur lors de la suppression des vidéos:', videosError);
    }

    // Supprimer les images
    const { error: imagesError } = await this.supabaseService.getSupabaseClient()
      .from('images')
      .delete()
      .eq('user_id', userId);

    if (imagesError) {
      console.error('Erreur lors de la suppression des images:', imagesError);
    }

    // Supprimer les sons
    const { error: soundsError } = await this.supabaseService.getSupabaseClient()
      .from('sounds')
      .delete()
      .eq('user_id', userId);

    if (soundsError) {
      console.error('Erreur lors de la suppression des sons:', soundsError);
    }
  }

  /**
   * Supprime les bilans de l'utilisateur
   */
  private async deleteUserBilans(userId: string): Promise<void> {
    const { error } = await this.supabaseService.getSupabaseClient()
      .from('bilans')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Erreur lors de la suppression des bilans:', error);
    }
  }

  /**
   * Marque l'utilisateur comme supprimé
   */
  private async markUserAsDeleted(userId: string): Promise<void> {
    const { error } = await this.supabaseService.getSupabaseClient()
      .from('users')
      .update({ 
        deleted_at: new Date().toISOString(),
        status: 'deleted'
      })
      .eq('id', userId);

    if (error) {
      console.error('Erreur lors de la marque de suppression de l\'utilisateur:', error);
    }
  }
}
