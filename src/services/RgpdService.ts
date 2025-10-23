import { SupabaseService } from './SupabaseService';
import { UserDataExport, AnonymizedUserDataExport } from '../types/rgpd';

export class RgpdService {
  private supabaseService: SupabaseService;

  constructor() {
    this.supabaseService = new SupabaseService();
  }

  /**
   * Récupère toutes les données d'un utilisateur pour l'export RGPD (version originale)
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
   * Récupère toutes les données d'un utilisateur pour l'export RGPD (structure masquée)
   */
  async exportAnonymizedUserData(userId: string): Promise<AnonymizedUserDataExport | null> {
    try {
      console.log(`📊 Début de l'export des données pour l'utilisateur: ${userId}`);

      // Récupérer les informations personnelles
      const personalInfo = await this.getPersonalInfo(userId);
      if (!personalInfo) {
        console.error(`❌ Utilisateur non trouvé: ${userId}`);
        return null;
      }

      // Récupérer toutes les données (structure masquée)
      const conversations = await this.getExportConversations(userId);
      const videos = await this.getExportVideos(userId);
      const images = await this.getExportImages(userId);
      const sounds = await this.getExportSounds(userId);
      const bilans = await this.getExportBilans(userId);
      const activities = await this.getExportActivities(userId);
      const activityRequestedModifications = await this.getExportActivityRequestedModifications(userId);
      const practices = await this.getExportPractices(userId);
      const userData = await this.getExportUserData(userId);
      const aiResponses = await this.getExportAiResponses(userId);
      const howanaConversations = await this.getExportHowanaConversations(userId);
      const userRendezVous = await this.getExportUserRendezVous(userId);
      const deliveries = await this.getExportDeliveries(userId);
      const emails = await this.getExportEmails(userId);
      const feedbacks = await this.getExportFeedbacks(userId);

      // Calculer les métadonnées
      const metadata = this.calculateAnonymizedMetadata(
        conversations, videos, images, sounds, bilans, 
        activities, activityRequestedModifications, practices, userData, aiResponses, 
        howanaConversations, userRendezVous, deliveries, emails, feedbacks
      );

      const anonymizedUserDataExport: AnonymizedUserDataExport = {
        userId,
        personalInfo,
        conversations,
        videos,
        images,
        sounds,
        bilans,
        activities,
        activityRequestedModifications,
        practices,
        userData,
        aiResponses,
        howanaConversations,
        userRendezVous,
        deliveries,
        emails,
        feedbacks,
        metadata
      };

      console.log(`✅ Export des données terminé pour l'utilisateur: ${userId}`);
      return anonymizedUserDataExport;

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

  // ===== FONCTIONS POUR EXPORT RGPD (STRUCTURE MASQUÉE) =====

  /**
   * Récupère les conversations de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportConversations(userId: string): Promise<AnonymizedUserDataExport['conversations']> {
    // TODO: Implémenter la récupération des conversations
    console.log(`🔍 Récupération des conversations pour l'utilisateur: ${userId}`);
    return [];
  }

  /**
   * Récupère les vidéos de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportVideos(userId: string): Promise<AnonymizedUserDataExport['videos']> {
    // TODO: Implémenter la récupération des vidéos
    console.log(`🔍 Récupération des vidéos pour l'utilisateur: ${userId}`);
    return [];
  }

  /**
   * Récupère les images de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportImages(userId: string): Promise<AnonymizedUserDataExport['images']> {
    // TODO: Implémenter la récupération des images
    console.log(`🔍 Récupération des images pour l'utilisateur: ${userId}`);
    return [];
  }

  /**
   * Récupère les sons de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportSounds(userId: string): Promise<AnonymizedUserDataExport['sounds']> {
    // TODO: Implémenter la récupération des sons
    console.log(`🔍 Récupération des sons pour l'utilisateur: ${userId}`);
    return [];
  }

  /**
   * Récupère les bilans de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportBilans(userId: string): Promise<AnonymizedUserDataExport['bilans']> {
    try {
      console.log(`🔍 Récupération des bilans pour l'utilisateur: ${userId}`);

      const { data, error } = await this.supabaseService.getSupabaseClient()
        .from('bilans')
        .select(`
          id,
          douleurs,
          notes_personnelles,
          resume_ia,
          conversation_context_id,
          conversation_summary,
          status,
          step,
          created_at,
          updated_at,
          scores,
          ai_summary,
          howana_summary
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur lors de la récupération des bilans:', error);
        return [];
      }

      if (!data) {
        return [];
      }

      // Mapper les données vers un format qui ne révèle pas la structure de la table
      const bilans = data.map(bilan => ({
        id: bilan.id,
        title: bilan.conversation_summary || undefined,
        content: (bilan.douleurs || "") + (bilan.notes_personnelles || "") + (bilan.resume_ia || ""),
        createdAt: bilan.created_at,
        updatedAt: bilan.updated_at,
        // Données complètes mais avec des noms de champs génériques
        douleurs: bilan.douleurs,
        notesPersonnelles: bilan.notes_personnelles,
        resumeIa: bilan.resume_ia,
        conversationContextId: bilan.conversation_context_id,
        conversationSummary: bilan.conversation_summary,
        status: bilan.status,
        step: bilan.step,
        scores: bilan.scores,
        aiSummary: bilan.ai_summary,
        howanaSummary: bilan.howana_summary
      }));

      console.log(`✅ ${bilans.length} bilans récupérés pour l'utilisateur: ${userId}`);
      return bilans;

    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des bilans pour l'utilisateur ${userId}:`, error);
      return [];
    }
  }

  /**
   * Récupère les activités de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportActivities(userId: string): Promise<AnonymizedUserDataExport['activities']> {
    try {
      console.log(`🔍 Récupération des activités pour l'utilisateur: ${userId}`);

      const { data, error } = await this.supabaseService.getSupabaseClient()
        .from('activities')
        .select(`
          id,
          title,
          short_description,
          long_description,
          created_at,
          updated_at,
          status,
          is_active,
          duration_minutes,
          participants,
          rating,
          price,
          location_type,
          typical_situations,
          presentation_image_public_url,
          presentation_video_public_url,
          benefits,
          selected_keywords,
          metadata,
          statistics,
          max_participants_by_user
        `)
        .eq('creator_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur lors de la récupération des activités:', error);
        return [];
      }

      if (!data) {
        return [];
      }

      // Mapper les données vers un format qui ne révèle pas la structure de la table
      const activities = data.map(activity => ({
        id: activity.id,
        title: activity.title || undefined,
        description: (activity.short_description || "") + (activity.long_description || ""),
        createdAt: activity.created_at,
        updatedAt: activity.updated_at,
        // Données complètes mais avec des noms de champs génériques
        status: activity.status,
        isActive: activity.is_active,
        durationMinutes: activity.duration_minutes,
        participants: activity.participants,
        rating: activity.rating,
        price: activity.price,
        locationType: activity.location_type,
        typicalSituations: activity.typical_situations,
        presentationImageUrl: activity.presentation_image_public_url,
        presentationVideoUrl: activity.presentation_video_public_url,
        benefits: activity.benefits,
        selectedKeywords: activity.selected_keywords,
        metadata: activity.metadata,
        statistics: activity.statistics,
        maxParticipantsByUser: activity.max_participants_by_user
      }));

      console.log(`✅ ${activities.length} activités récupérées pour l'utilisateur: ${userId}`);
      return activities;

    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des activités pour l'utilisateur ${userId}:`, error);
      return [];
    }
  }

  /**
   * Récupère les demandes de modifications d'activités de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportActivityRequestedModifications(userId: string): Promise<AnonymizedUserDataExport['activityRequestedModifications']> {
    // TODO: Implémenter la récupération des demandes de modifications d'activités
    console.log(`🔍 Récupération des demandes de modifications d'activités pour l'utilisateur: ${userId}`);
    return [];
  }

  /**
   * Récupère les pratiques de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportPractices(userId: string): Promise<AnonymizedUserDataExport['practices']> {
    // TODO: Implémenter la récupération des pratiques
    console.log(`🔍 Récupération des pratiques pour l'utilisateur: ${userId}`);
    return [];
  }

  /**
   * Récupère les données utilisateur (données complètes, structure masquée)
   */
  private async getExportUserData(userId: string): Promise<AnonymizedUserDataExport['userData']> {
    // TODO: Implémenter la récupération des données utilisateur
    console.log(`🔍 Récupération des données utilisateur pour l'utilisateur: ${userId}`);
    return [];
  }

  /**
   * Récupère les réponses IA de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportAiResponses(userId: string): Promise<AnonymizedUserDataExport['aiResponses']> {
    try {
      console.log(`🔍 Récupération des réponses IA pour l'utilisateur: ${userId}`);

      const { data, error } = await this.supabaseService.getSupabaseClient()
        .from('ai_responses')
        .select(`
          id,
          conversation_id,
          response_text,
          message_type,
          created_at,
          metadata
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur lors de la récupération des réponses IA:', error);
        return [];
      }

      if (!data) {
        return [];
      }

      // Mapper les données vers un format qui ne révèle pas la structure de la table
      const aiResponses = data.map(response => ({
        id: response.id,
        conversationId: response.conversation_id,
        responseText: response.response_text,
        messageType: response.message_type,
        createdAt: response.created_at,
        metadata: response.metadata
      }));

      console.log(`✅ ${aiResponses.length} réponses IA récupérées pour l'utilisateur: ${userId}`);
      return aiResponses;

    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des réponses IA pour l'utilisateur ${userId}:`, error);
      return [];
    }
  }

  /**
   * Récupère les conversations Howana de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportHowanaConversations(userId: string): Promise<AnonymizedUserDataExport['howanaConversations']> {
    // TODO: Implémenter la récupération des conversations Howana
    console.log(`🔍 Récupération des conversations Howana pour l'utilisateur: ${userId}`);
    return [];
  }

  /**
   * Récupère les rendez-vous utilisateur (données complètes, structure masquée)
   */
  private async getExportUserRendezVous(userId: string): Promise<AnonymizedUserDataExport['userRendezVous']> {
    // TODO: Implémenter la récupération des rendez-vous utilisateur
    console.log(`🔍 Récupération des rendez-vous utilisateur pour l'utilisateur: ${userId}`);
    return [];
  }

  /**
   * Récupère les livraisons de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportDeliveries(userId: string): Promise<AnonymizedUserDataExport['deliveries']> {
    try {
      console.log(`🔍 Récupération des livraisons pour l'utilisateur: ${userId}`);

      const { data, error } = await this.supabaseService.getSupabaseClient()
        .from('deliveries')
        .select(`
          id,
          delivery_type,
          delivery_address,
          delivery_reference,
          created_at,
          expected_at,
          payment_intent_id,
          status,
          tracking_number,
          actual_delivery_date,
          is_gift,
          recipient_first_name,
          recipient_last_name,
          recipient_email,
          recipient_info,
          personal_message,
          updated_at,
          gift_amount,
          selected_formula,
          activation_date,
          tracking_type,
          stripe_subscription_session_id,
          transport_costs,
          promotion_id
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur lors de la récupération des livraisons:', error);
        return [];
      }

      if (!data) {
        return [];
      }

      // Mapper les données vers un format qui ne révèle pas la structure de la table
      const deliveries = data.map(delivery => ({
        id: delivery.id,
        deliveryType: delivery.delivery_type,
        deliveryAddress: delivery.delivery_address,
        deliveryReference: delivery.delivery_reference,
        createdAt: delivery.created_at,
        expectedAt: delivery.expected_at,
        paymentIntentId: delivery.payment_intent_id,
        status: delivery.status,
        trackingNumber: delivery.tracking_number,
        actualDeliveryDate: delivery.actual_delivery_date,
        isGift: delivery.is_gift,
        recipientFirstName: delivery.recipient_first_name,
        recipientLastName: delivery.recipient_last_name,
        recipientEmail: delivery.recipient_email,
        recipientInfo: delivery.recipient_info,
        personalMessage: delivery.personal_message,
        updatedAt: delivery.updated_at,
        giftAmount: delivery.gift_amount,
        selectedFormula: delivery.selected_formula,
        activationDate: delivery.activation_date,
        trackingType: delivery.tracking_type,
        stripeSubscriptionSessionId: delivery.stripe_subscription_session_id,
        transportCosts: delivery.transport_costs,
        promotionId: delivery.promotion_id
      }));

      console.log(`✅ ${deliveries.length} livraisons récupérées pour l'utilisateur: ${userId}`);
      return deliveries;

    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des livraisons pour l'utilisateur ${userId}:`, error);
      return [];
    }
  }

  /**
   * Récupère les emails de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportEmails(userId: string): Promise<AnonymizedUserDataExport['emails']> {
    try {
      console.log(`🔍 Récupération des emails pour l'utilisateur: ${userId}`);

      const { data, error } = await this.supabaseService.getSupabaseClient()
        .from('email_to_send')
        .select(`
          id,
          from_email,
          to_emails,
          cc_emails,
          bcc_emails,
          subject,
          template,
          text,
          reply_to,
          mapping,
          tags,
          headers,
          status,
          fail_reason,
          resend_id,
          attempts,
          scheduled_at,
          sent_at,
          created_at,
          updated_at
        `)
        .contains('to_emails', [userId])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur lors de la récupération des emails:', error);
        return [];
      }

      if (!data) {
        return [];
      }

      // Mapper les données vers un format qui ne révèle pas la structure de la table
      const emails = data.map(email => ({
        fromEmail: email.from_email,
        toEmails: email.to_emails,
        ccEmails: email.cc_emails,
        bccEmails: email.bcc_emails,
        subject: email.subject,
        template: email.template,
        text: email.text,
        replyTo: email.reply_to,
        mapping: email.mapping,
        tags: email.tags,
        headers: email.headers,
        status: email.status,
        failReason: email.fail_reason,
        attempts: email.attempts,
        scheduledAt: email.scheduled_at,
        sentAt: email.sent_at,
        createdAt: email.created_at,
        updatedAt: email.updated_at
      }));

      console.log(`✅ ${emails.length} emails récupérés pour l'utilisateur: ${userId}`);
      return emails;

    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des emails pour l'utilisateur ${userId}:`, error);
      return [];
    }
  }

  /**
   * Récupère les feedbacks de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportFeedbacks(userId: string): Promise<AnonymizedUserDataExport['feedbacks']> {
    try {
      console.log(`🔍 Récupération des feedbacks pour l'utilisateur: ${userId}`);

      // D'abord, récupérer l'email de l'utilisateur
      const { data: userData, error: userError } = await this.supabaseService.getSupabaseClient()
        .from('user_data')
        .select('email')
        .eq('user_id', userId)
        .single();

      if (userError) {
        console.error('Erreur lors de la récupération de l\'email utilisateur:', userError);
        return [];
      }

      const userEmail = userData?.email;

      // Construire la requête OR avec l'email si disponible
      let orCondition = `practitioner_user_id.eq.${userId},activity_guest_id.eq.${userId}`;
      if (userEmail) {
        orCondition += `,patient_email.eq.${userEmail}`;
      }

      const { data, error } = await this.supabaseService.getSupabaseClient()
        .from('feedback')
        .select(`
          id,
          practitioner_user_id,
          patient_name,
          patient_email,
          patient_email_validated,
          rating,
          experience_quality,
          communication_quality,
          overall_satisfaction,
          additional_comments,
          is_anonymous,
          created_at,
          updated_at,
          experience,
          feedback_type,
          feedback_videos,
          feedback_images,
          activity_guest_id,
          activity_id
        `)
        .or(orCondition)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur lors de la récupération des feedbacks:', error);
        return [];
      }

      if (!data) {
        return [];
      }

      // Mapper les données vers un format qui ne révèle pas la structure de la table
      const feedbacks = data.map(feedback => ({
        id: feedback.id,
        practitionerUserId: feedback.practitioner_user_id,
        patientName: feedback.patient_name,
        patientEmail: feedback.patient_email,
        patientEmailValidated: feedback.patient_email_validated,
        rating: feedback.rating,
        experienceQuality: feedback.experience_quality,
        communicationQuality: feedback.communication_quality,
        overallSatisfaction: feedback.overall_satisfaction,
        additionalComments: feedback.additional_comments,
        isAnonymous: feedback.is_anonymous,
        createdAt: feedback.created_at,
        updatedAt: feedback.updated_at,
        experience: feedback.experience,
        feedbackType: feedback.feedback_type,
        feedbackVideos: feedback.feedback_videos,
        feedbackImages: feedback.feedback_images,
        activityGuestId: feedback.activity_guest_id,
        activityId: feedback.activity_id
      }));

      console.log(`✅ ${feedbacks.length} feedbacks récupérés pour l'utilisateur: ${userId}`);
      return feedbacks;

    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des feedbacks pour l'utilisateur ${userId}:`, error);
      return [];
    }
  }

  /**
   * Calcule les métadonnées de l'export anonymisé
   */
  private calculateAnonymizedMetadata(
    conversations: AnonymizedUserDataExport['conversations'],
    videos: AnonymizedUserDataExport['videos'],
    images: AnonymizedUserDataExport['images'],
    sounds: AnonymizedUserDataExport['sounds'],
    bilans: AnonymizedUserDataExport['bilans'],
    activities: AnonymizedUserDataExport['activities'],
    activityRequestedModifications: AnonymizedUserDataExport['activityRequestedModifications'],
    practices: AnonymizedUserDataExport['practices'],
    userData: AnonymizedUserDataExport['userData'],
    aiResponses: AnonymizedUserDataExport['aiResponses'],
    howanaConversations: AnonymizedUserDataExport['howanaConversations'],
    userRendezVous: AnonymizedUserDataExport['userRendezVous'],
    deliveries: AnonymizedUserDataExport['deliveries'],
    emails: AnonymizedUserDataExport['emails'],
    feedbacks: AnonymizedUserDataExport['feedbacks']
  ): AnonymizedUserDataExport['metadata'] {
    const dataSize = this.calculateAnonymizedDataSize(
      conversations, videos, images, sounds, bilans, 
      activities, activityRequestedModifications, practices, userData, aiResponses, 
      howanaConversations, userRendezVous, deliveries, emails, feedbacks
    );

    return {
      totalConversations: conversations.length,
      totalVideos: videos.length,
      totalImages: images.length,
      totalSounds: sounds.length,
      totalBilans: bilans.length,
      totalActivities: activities.length,
      totalActivityRequestedModifications: activityRequestedModifications.length,
      totalPractices: practices.length,
      totalUserData: userData.length,
      totalAiResponses: aiResponses.length,
      totalHowanaConversations: howanaConversations.length,
      totalUserRendezVous: userRendezVous.length,
      totalDeliveries: deliveries.length,
      totalEmails: emails.length,
      totalFeedbacks: feedbacks.length,
      exportDate: new Date().toISOString(),
      dataSize: `${dataSize} MB`
    };
  }

  /**
   * Calcule la taille approximative des données anonymisées
   */
  private calculateAnonymizedDataSize(
    conversations: AnonymizedUserDataExport['conversations'],
    videos: AnonymizedUserDataExport['videos'],
    images: AnonymizedUserDataExport['images'],
    sounds: AnonymizedUserDataExport['sounds'],
    bilans: AnonymizedUserDataExport['bilans'],
    activities: AnonymizedUserDataExport['activities'],
    activityRequestedModifications: AnonymizedUserDataExport['activityRequestedModifications'],
    practices: AnonymizedUserDataExport['practices'],
    userData: AnonymizedUserDataExport['userData'],
    aiResponses: AnonymizedUserDataExport['aiResponses'],
    howanaConversations: AnonymizedUserDataExport['howanaConversations'],
    userRendezVous: AnonymizedUserDataExport['userRendezVous'],
    deliveries: AnonymizedUserDataExport['deliveries'],
    emails: AnonymizedUserDataExport['emails'],
    feedbacks: AnonymizedUserDataExport['feedbacks']
  ): number {
    // Estimation approximative de la taille des données anonymisées
    const conversationSize = conversations.reduce((acc, conv) => {
      return acc + conv.messages.reduce((msgAcc, msg) => msgAcc + msg.content.length, 0);
    }, 0);

    const bilanSize = bilans.reduce((acc, bilan) => acc + bilan.content.length, 0);
    const aiResponseSize = aiResponses.reduce((acc, response) => acc + response.responseText.length, 0);

    // Estimation pour les activités et pratiques (contenu textuel)
    const activitySize = activities.reduce((acc, activity) => {
      return acc + (activity.title?.length || 0) + (activity.description?.length || 0);
    }, 0);

    const activityModificationSize = activityRequestedModifications.reduce((acc, modification) => {
      return acc + (modification.title?.length || 0) + (modification.shortDescription?.length || 0) + (modification.longDescription?.length || 0);
    }, 0);

    const practiceSize = practices.reduce((acc, practice) => {
      return acc + (practice.title?.length || 0) + (practice.description?.length || 0);
    }, 0);

    // Estimation pour les données utilisateur
    const userDataSize = userData.reduce((acc, data) => {
      return acc + (data.experience?.length || 0) + (data.typicalSituations?.length || 0);
    }, 0);

    // Estimation pour les conversations Howana (contexte JSON)
    const howanaSize = howanaConversations.reduce((acc, conv) => {
      return acc + (conv.context ? JSON.stringify(conv.context).length : 0);
    }, 0);

    // Estimation pour les rendez-vous (métadonnées)
    const rendezVousSize = userRendezVous.length * 50; // Estimation par rendez-vous

    // Estimation pour les livraisons (adresses, messages, formules)
    const deliverySize = deliveries.reduce((acc, delivery) => {
      return acc + (delivery.personalMessage?.length || 0) + 
             (delivery.deliveryAddress ? JSON.stringify(delivery.deliveryAddress).length : 0) +
             (delivery.selectedFormula ? JSON.stringify(delivery.selectedFormula).length : 0);
    }, 0);

    // Estimation pour les emails (sujet, contenu, mapping)
    const emailSize = emails.reduce((acc, email) => {
      return acc + (email.subject?.length || 0) + (email.text?.length || 0) + 
             (email.mapping ? JSON.stringify(email.mapping).length : 0) +
             (email.tags ? JSON.stringify(email.tags).length : 0);
    }, 0);

    // Estimation pour les feedbacks (commentaires, expérience, médias)
    const feedbackSize = feedbacks.reduce((acc, feedback) => {
      return acc + (feedback.patientName?.length || 0) + (feedback.patientEmail?.length || 0) + 
             (feedback.experienceQuality?.length || 0) + (feedback.communicationQuality?.length || 0) + 
             (feedback.overallSatisfaction?.length || 0) + (feedback.additionalComments?.length || 0) +
             (feedback.experience ? JSON.stringify(feedback.experience).length : 0) + 
             (feedback.feedbackVideos ? JSON.stringify(feedback.feedbackVideos).length : 0) + 
             (feedback.feedbackImages ? JSON.stringify(feedback.feedbackImages).length : 0);
    }, 0);

    // Estimation pour les médias (très approximative)
    const mediaSize = (videos.length * 50) + (images.length * 2) + (sounds.length * 10);

    const totalBytes = conversationSize + bilanSize + aiResponseSize + activitySize + 
                      activityModificationSize + practiceSize + userDataSize + howanaSize + 
                      rendezVousSize + deliverySize + emailSize + feedbackSize + mediaSize;
    return Math.round(totalBytes / (1024 * 1024) * 100) / 100; // Conversion en MB
  }
}
