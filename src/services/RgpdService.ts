import { SupabaseService } from './SupabaseService';
import { UserDataExport, AnonymizedUserDataExport } from '../types/rgpd';

export class RgpdService {
  private supabaseService: SupabaseService;

  constructor() {
    this.supabaseService = new SupabaseService();
  }

  /**
   * Récupère toutes les données d'un utilisateur pour l'export RGPD (structure masquée)
   */
  async exportUserData(userId: string): Promise<AnonymizedUserDataExport | null> {
    try {
      console.log(`📊 Début de l'export des données pour l'utilisateur: ${userId}`);

      // Récupérer les informations personnelles
      const personalInfo = await this.getPersonalInfo(userId);
      if (!personalInfo) {
        console.error(`❌ Utilisateur non trouvé: ${userId}`);
        return null;
      }

      // Récupérer toutes les données (structure masquée)
      const bilans = await this.getExportBilans(userId);
      const activities = await this.getExportActivities(userId);
      const activityRequestedModifications = await this.getExportActivityRequestedModifications(userId);
      const userProfile = await this.getExportUserData(userId);
      const aiResponses = await this.getExportAiResponses(userId);
      const howanaConversations = await this.getExportHowanaConversations(userId);
      const rendezVous = await this.getExportRendezVous(userId);
      const deliveries = await this.getExportDeliveries(userId);
      const emails = await this.getExportEmails(userId);
      const feedbacks = await this.getExportFeedbacks(userId);
      const openMapData = await this.getExportOpenMapData(userId);
      const treasureChest = await this.getExportTreasureChest(userId);
      const userEvents = await this.getExportUserEvents(userId);

      // Calculer les métadonnées
      const metadata = this.calculateAnonymizedMetadata(
        bilans, 
        activities, activityRequestedModifications, aiResponses, 
        howanaConversations, rendezVous, deliveries, emails, feedbacks, openMapData, treasureChest, userEvents, userProfile
      );

      const anonymizedUserDataExport: AnonymizedUserDataExport = {
        userId,
        personalInfo,
        bilans,
        activities,
        activityRequestedModifications,
        aiResponses,
        howanaConversations,
        rendezVous,
        deliveries,
        emails,
        feedbacks,
        openMapData,
        treasureChest,
        userEvents,
        userProfile,
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
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      console.error('Erreur lors de la récupération des informations personnelles:', error);
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
    try {
      console.log(`🔍 Récupération des demandes de modifications d'activités pour l'utilisateur: ${userId}`);

      const { data, error } = await this.supabaseService.getSupabaseClient()
        .from('activity_requested_modifications')
        .select(`
          id,
          activity_id,
          title,
          presentation_image_public_url,
          short_description,
          long_description,
          benefits,
          practice_id,
          price,
          typical_situations,
          presentation_video_public_url,
          address,
          selected_keywords,
          status,
          requested_at,
          reviewed_at,
          reviewed_by,
          review_notes,
          created_at,
          updated_at
        `)
        .eq('creator_id', userId);

      if (error) {
        console.error(`❌ Erreur lors de la récupération des demandes de modifications d'activités pour l'utilisateur ${userId}:`, error);
        return [];
      }

      if (!data || data.length === 0) {
        console.log(`ℹ️ Aucune demande de modification d'activité trouvée pour l'utilisateur: ${userId}`);
        return [];
      }

      // Mapper les données de snake_case vers camelCase
      const activityRequestedModifications = data.map(modification => ({
        id: modification.id,
        activityId: modification.activity_id,
        title: modification.title,
        presentationImageUrl: modification.presentation_image_public_url,
        shortDescription: modification.short_description,
        longDescription: modification.long_description,
        benefits: modification.benefits,
        practiceId: modification.practice_id,
        price: modification.price,
        typicalSituations: modification.typical_situations,
        presentationVideoUrl: modification.presentation_video_public_url,
        address: modification.address,
        selectedKeywords: modification.selected_keywords,
        status: modification.status,
        requestedAt: modification.requested_at,
        reviewedAt: modification.reviewed_at,
        reviewedBy: modification.reviewed_by,
        reviewNotes: modification.review_notes,
        createdAt: modification.created_at,
        updatedAt: modification.updated_at
      }));

      console.log(`✅ ${activityRequestedModifications.length} demandes de modifications d'activités récupérées pour l'utilisateur: ${userId}`);
      return activityRequestedModifications;

    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des demandes de modifications d'activités pour l'utilisateur ${userId}:`, error);
      return [];
    }
  }

  /**
   * Récupère les données utilisateur (données complètes, structure masquée)
   */
  private async getExportUserData(userId: string): Promise<AnonymizedUserDataExport['userProfile']> {
    try {
      console.log(`🔍 Récupération des données utilisateur pour l'utilisateur: ${userId}`);

      // Récupérer les données utilisateur principales
      const { data: userData, error: userDataError } = await this.supabaseService.getSupabaseClient()
        .from('user_data')
        .select(`
          id,
          user_id,
          data_folder,
          first_name,
          last_name,
          email,
          customer_id,
          phone,
          birth_date,
          address,
          subscription_type,
          active_formula,
          stripe_connect_account_id,
          status,
          profil,
          referral_code,
          onboarding_referral,
          onboarding_demande_date,
          specialties,
          experience,
          diplomas,
          photo_url,
          title_progression,
          fcm_token,
          map_data,
          howana_recommandation,
          typical_situations,
          preferences,
          favourites,
          statistics,
          created_at,
          updated_at
        `)
        .eq('user_id', userId)
        .single();

      if (userDataError) {
        console.error('Erreur lors de la récupération des données utilisateur:', userDataError);
        return {
          id: '',
          userId: userId,
          firstName: '',
          lastName: '',
          email: '',
          status: 'unknown',
          profil: 'unknown',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }

      if (!userData) {
        return {
          id: '',
          userId: userId,
          firstName: '',
          lastName: '',
          email: '',
          status: 'unknown',
          profil: 'unknown',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }

      // Récupérer les modifications en attente
      const { data: pendingModificationData } = await this.supabaseService.getSupabaseClient()
        .from('user_data_requested_modifications')
        .select(`
          id,
          user_id,
          specialties,
          experience,
          diplomas,
          typical_situations,
          status,
          requested_at,
          reviewed_at,
          reviewed_by,
          review_notes,
          created_at,
          updated_at
        `)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .single();

      // Récupérer le rôle utilisateur
      const { data: roleData } = await this.supabaseService.getSupabaseClient()
        .from('user_roles')
        .select(`
          roles(name)
        `)
        .eq('user_id', userId);

      const role = roleData && Array.isArray(roleData) && roleData.length > 0 
        ? ((roleData[0]?.roles ?? {}) as any).name || roleData[0]?.roles?.[0]?.name || undefined
        : undefined;

      // Transformer les données vers le format camelCase
      const transformedUserData: AnonymizedUserDataExport['userProfile'] = {
        id: String(userData.id),
        userId: String(userData.user_id),
        ...(userData.data_folder && { dataFolder: String(userData.data_folder) }),
        firstName: String(userData.first_name),
        lastName: String(userData.last_name),
        email: String(userData.email),
        ...(userData.customer_id && { customerId: String(userData.customer_id) }),
        ...(userData.phone && { phone: String(userData.phone) }),
        ...(userData.birth_date && { birthDate: String(userData.birth_date) }),
        ...(userData.address && { address: {
          ...(userData.address.street && { street: userData.address.street }),
          ...(userData.address.city && { city: userData.address.city }),
          ...(userData.address.postal_code && { postalCode: userData.address.postal_code }),
          ...(userData.address.country && { country: userData.address.country })
        }}),
        ...(userData.subscription_type && { subscriptionType: String(userData.subscription_type) }),
        ...(userData.active_formula && { activeFormula: String(userData.active_formula) }),
        ...(userData.stripe_connect_account_id && { stripeConnectAccountId: String(userData.stripe_connect_account_id) }),
        status: String(userData.status),
        profil: String(userData.profil),
        ...(userData.referral_code && { referralCode: String(userData.referral_code) }),
        ...(userData.onboarding_referral && { onboardingReferral: String(userData.onboarding_referral) }),
        ...(userData.onboarding_demande_date && { onboardingDemandeDate: String(userData.onboarding_demande_date) }),
        ...(userData.specialties && { specialties: this.transformSpecialties(userData.specialties) }),
        ...(userData.experience && { experience: String(userData.experience) }),
        ...(userData.diplomas && { diplomas: this.transformDiplomas(userData.diplomas) }),
        ...(userData.photo_url && { photoUrl: String(userData.photo_url) }),
        ...(userData.title_progression && { titleProgression: this.transformTitleProgression(userData.title_progression) }),
        ...(userData.fcm_token && { fcmToken: String(userData.fcm_token) }),
        ...(userData.map_data && { mapData: {
          ...(userData.map_data.dominant_family_id && { dominantFamilyId: userData.map_data.dominant_family_id })
        }}),
        ...(userData.howana_recommandation && { howanaRecommandation: String(userData.howana_recommandation) }),
        ...(userData.typical_situations && { typicalSituations: String(userData.typical_situations) }),
        ...(userData.preferences && { preferences: {
          email: Boolean(userData.preferences.email),
          push: Boolean(userData.preferences.push)
        }}),
        ...(userData.favourites && { favourites: userData.favourites.map((fav: any) => ({
          id: String(fav.id),
          type: String(fav.type),
          addedAt: String(fav.addedAt)
        }))}),
        ...(userData.statistics && { statistics: this.transformStatisticsToCamelCase(userData.statistics) }),
        createdAt: String(userData.created_at),
        updatedAt: String(userData.updated_at),
        pendingModificationData: pendingModificationData ? {
          id: String(pendingModificationData.id),
          userId: String(pendingModificationData.user_id),
          ...(pendingModificationData.specialties && { specialties: pendingModificationData.specialties }),
          ...(pendingModificationData.experience && { experience: String(pendingModificationData.experience) }),
          ...(pendingModificationData.diplomas && { diplomas: pendingModificationData.diplomas }),
          ...(pendingModificationData.typical_situations && { typicalSituations: String(pendingModificationData.typical_situations) }),
          status: String(pendingModificationData.status),
          requestedAt: String(pendingModificationData.requested_at),
          ...(pendingModificationData.reviewed_at && { reviewedAt: String(pendingModificationData.reviewed_at) }),
          ...(pendingModificationData.reviewed_by && { reviewedBy: String(pendingModificationData.reviewed_by) }),
          ...(pendingModificationData.review_notes && { reviewNotes: String(pendingModificationData.review_notes) }),
          createdAt: String(pendingModificationData.created_at),
          updatedAt: String(pendingModificationData.updated_at)
        } : undefined,
        role: role
      };

      console.log(`✅ Données utilisateur récupérées pour l'utilisateur: ${userId}`);
      return transformedUserData;

    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des données utilisateur pour l'utilisateur ${userId}:`, error);
      return {
        id: '',
        userId: userId,
        firstName: '',
        lastName: '',
        email: '',
        status: 'unknown',
        profil: 'unknown',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
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
   * Récupère les rendez-vous de l'utilisateur (données complètes, structure masquée)
   * Combine les tables rendezvous et user_rendezvous
   */
  private async getExportRendezVous(userId: string): Promise<AnonymizedUserDataExport['rendezVous']> {
    try {
      console.log(`🔍 Récupération des rendez-vous pour l'utilisateur: ${userId}`);

      // Cas 1: Récupérer les rendez-vous où l'utilisateur est participant
      const { data: userRendezVousData, error: userRendezVousError } = await this.supabaseService.getSupabaseClient()
        .from('user_rendezvous')
        .select(`
          id,
          user_id,
          rendez_vous_id,
          status,
          created_at,
          updated_at,
          amount_from_treasure,
          participants,
          payment_status,
          hower_angel_id,
          first_name,
          last_name,
          email,
          phone,
          reduction_type
        `)
        .eq('user_id', userId);

      if (userRendezVousError) {
        console.error('Erreur lors de la récupération des user_rendezvous:', userRendezVousError);
        return [];
      }

      // Cas 2: Récupérer les rendez-vous des activités créées par l'utilisateur
      const { data: activitiesData, error: activitiesError } = await this.supabaseService.getSupabaseClient()
        .from('activities')
        .select('id')
        .eq('creator_id', userId);

      if (activitiesError) {
        console.error('Erreur lors de la récupération des activités:', activitiesError);
        return [];
      }

      const activityIds = activitiesData?.map(activity => activity.id) || [];

      // Récupérer les rendez-vous des activités créées par l'utilisateur
      let creatorRendezVousData: any[] = [];
      if (activityIds.length > 0) {
        const { data: rendezVousData, error: rendezVousError } = await this.supabaseService.getSupabaseClient()
          .from('rendezvous')
          .select(`
            id,
            date,
            hour,
            minute,
            activity_id,
            status,
            created_at,
            updated_at,
            participants
          `)
          .in('activity_id', activityIds);

        if (rendezVousError) {
          console.error('Erreur lors de la récupération des rendez-vous créés:', rendezVousError);
        } else {
          creatorRendezVousData = rendezVousData || [];
        }
      }

      // Récupérer les détails des rendez-vous où l'utilisateur est participant
      const rendezVousIds = userRendezVousData?.map(ur => ur.rendez_vous_id) || [];
      let participantRendezVousData: any[] = [];
      let participantUserRendezVousData: any[] = [];

      if (rendezVousIds.length > 0) {
        // Récupérer les rendez-vous
        const { data: rendezVousData, error: rendezVousError } = await this.supabaseService.getSupabaseClient()
          .from('rendezvous')
          .select(`
            id,
            date,
            hour,
            minute,
            activity_id,
            status,
            created_at,
            updated_at,
            participants
          `)
          .in('id', rendezVousIds);

        if (rendezVousError) {
          console.error('Erreur lors de la récupération des rendez-vous participants:', rendezVousError);
        } else {
          participantRendezVousData = rendezVousData || [];
        }

        // Récupérer tous les participants de ces rendez-vous
        const { data: allParticipantsData, error: allParticipantsError } = await this.supabaseService.getSupabaseClient()
          .from('user_rendezvous')
          .select(`
            id,
            user_id,
            rendez_vous_id,
            status,
            created_at,
            updated_at,
            amount_from_treasure,
            participants,
            payment_status,
            hower_angel_id,
            first_name,
            last_name,
            email,
            phone,
            reduction_type
          `)
          .in('rendez_vous_id', rendezVousIds);

        if (allParticipantsError) {
          console.error('Erreur lors de la récupération des participants:', allParticipantsError);
        } else {
          participantUserRendezVousData = allParticipantsData || [];
        }
      }

      // Construire la réponse combinée
      const rendezVous: AnonymizedUserDataExport['rendezVous'] = [];

      // Ajouter les rendez-vous où l'utilisateur est participant
      for (const rendezVousItem of participantRendezVousData) {
        const userRendezVousItem = userRendezVousData?.find(ur => ur.rendez_vous_id === rendezVousItem.id);
        const allParticipants = participantUserRendezVousData.filter(ur => ur.rendez_vous_id === rendezVousItem.id);

        rendezVous.push({
          id: String(rendezVousItem.id),
          date: String(rendezVousItem.date),
          hour: Number(rendezVousItem.hour),
          minute: Number(rendezVousItem.minute),
          activityId: String(rendezVousItem.activity_id),
          status: String(rendezVousItem.status),
          createdAt: String(rendezVousItem.created_at),
          updatedAt: String(rendezVousItem.updated_at),
          participants: Number(rendezVousItem.participants),
          userRendezVous: userRendezVousItem ? {
            id: String(userRendezVousItem.id),
            userId: String(userRendezVousItem.user_id),
            status: String(userRendezVousItem.status),
            createdAt: String(userRendezVousItem.created_at),
            updatedAt: String(userRendezVousItem.updated_at),
            amountFromTreasure: Number(userRendezVousItem.amount_from_treasure),
            participants: Number(userRendezVousItem.participants),
            paymentStatus: String(userRendezVousItem.payment_status),
            ...(userRendezVousItem.hower_angel_id && { howerAngelId: String(userRendezVousItem.hower_angel_id) }),
            ...(userRendezVousItem.first_name && { firstName: String(userRendezVousItem.first_name) }),
            ...(userRendezVousItem.last_name && { lastName: String(userRendezVousItem.last_name) }),
            ...(userRendezVousItem.email && { email: String(userRendezVousItem.email) }),
            ...(userRendezVousItem.phone && { phone: String(userRendezVousItem.phone) }),
            ...(userRendezVousItem.reduction_type && { reductionType: String(userRendezVousItem.reduction_type) })
          } : undefined,
          allParticipants: allParticipants.map(participant => ({
            id: String(participant.id),
            userId: String(participant.user_id),
            status: String(participant.status),
            createdAt: String(participant.created_at),
            updatedAt: String(participant.updated_at),
            amountFromTreasure: Number(participant.amount_from_treasure),
            participants: Number(participant.participants),
            paymentStatus: String(participant.payment_status),
            ...(participant.hower_angel_id && { howerAngelId: String(participant.hower_angel_id) }),
            ...(participant.first_name && { firstName: String(participant.first_name) }),
            ...(participant.last_name && { lastName: String(participant.last_name) }),
            ...(participant.email && { email: String(participant.email) }),
            ...(participant.phone && { phone: String(participant.phone) }),
            ...(participant.reduction_type && { reductionType: String(participant.reduction_type) })
          }))
        });
      }

      // Ajouter les rendez-vous des activités créées par l'utilisateur (sans duplication)
      for (const rendezVousItem of creatorRendezVousData) {
        // Vérifier si ce rendez-vous n'est pas déjà ajouté
        if (!rendezVous.find(rv => rv.id === rendezVousItem.id)) {
          // Récupérer tous les participants de ce rendez-vous
          const { data: allParticipantsData } = await this.supabaseService.getSupabaseClient()
            .from('user_rendezvous')
            .select(`
              id,
              user_id,
              rendez_vous_id,
              status,
              created_at,
              updated_at,
              amount_from_treasure,
              participants,
              payment_status,
              hower_angel_id,
              first_name,
              last_name,
              email,
              phone,
              reduction_type
            `)
            .eq('rendez_vous_id', rendezVousItem.id);

          const allParticipants = allParticipantsData || [];

          rendezVous.push({
            id: String(rendezVousItem.id),
            date: String(rendezVousItem.date),
            hour: Number(rendezVousItem.hour),
            minute: Number(rendezVousItem.minute),
            activityId: String(rendezVousItem.activity_id),
            status: String(rendezVousItem.status),
            createdAt: String(rendezVousItem.created_at),
            updatedAt: String(rendezVousItem.updated_at),
            participants: Number(rendezVousItem.participants),
            allParticipants: allParticipants.map(participant => ({
              id: String(participant.id),
              userId: String(participant.user_id),
              status: String(participant.status),
              createdAt: String(participant.created_at),
              updatedAt: String(participant.updated_at),
              amountFromTreasure: Number(participant.amount_from_treasure),
              participants: Number(participant.participants),
              paymentStatus: String(participant.payment_status),
              ...(participant.hower_angel_id && { howerAngelId: String(participant.hower_angel_id) }),
              ...(participant.first_name && { firstName: String(participant.first_name) }),
              ...(participant.last_name && { lastName: String(participant.last_name) }),
              ...(participant.email && { email: String(participant.email) }),
              ...(participant.phone && { phone: String(participant.phone) }),
              ...(participant.reduction_type && { reductionType: String(participant.reduction_type) })
            }))
          });
        }
      }

      // Trier par date et heure
      rendezVous.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.hour.toString().padStart(2, '0')}:${a.minute.toString().padStart(2, '0')}:00`);
        const dateB = new Date(`${b.date}T${b.hour.toString().padStart(2, '0')}:${b.minute.toString().padStart(2, '0')}:00`);
        return dateB.getTime() - dateA.getTime();
      });

      console.log(`✅ ${rendezVous.length} rendez-vous récupérés pour l'utilisateur: ${userId}`);
      return rendezVous;

    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des rendez-vous pour l'utilisateur ${userId}:`, error);
      return [];
    }
  }

  /**
   * Récupère les données OpenMap de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportOpenMapData(userId: string): Promise<AnonymizedUserDataExport['openMapData']> {
    try {
      console.log(`🔍 Récupération des données OpenMap pour l'utilisateur: ${userId}`);

      const { data, error } = await this.supabaseService.getSupabaseClient()
        .from('open_map_data')
        .select(`
          id,
          user_data_id,
          user_id,
          specialties,
          gps_location,
          dominant_family_id,
          dominant_family_name,
          dominant_color,
          created_at,
          updated_at,
          first_name,
          last_name,
          email,
          phone,
          address,
          experience,
          diplomas,
          photo_url,
          title_progression,
          vector_summary,
          is_active
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur lors de la récupération des données OpenMap:', error);
        return [];
      }

      if (!data) {
        return [];
      }

      // Mapper les données vers un format qui ne révèle pas la structure de la table
      const openMapData = data.map(openMap => ({
        id: openMap.id,
        userDataId: openMap.user_data_id,
        userId: openMap.user_id,
        specialties: openMap.specialties,
        gpsLocation: openMap.gps_location,
        dominantFamilyId: openMap.dominant_family_id,
        dominantFamilyName: openMap.dominant_family_name,
        dominantColor: openMap.dominant_color,
        createdAt: openMap.created_at,
        updatedAt: openMap.updated_at,
        firstName: openMap.first_name,
        lastName: openMap.last_name,
        email: openMap.email,
        phone: openMap.phone,
        address: openMap.address,
        experience: openMap.experience,
        diplomas: openMap.diplomas,
        photoUrl: openMap.photo_url,
        titleProgression: openMap.title_progression,
        vectorSummary: openMap.vector_summary,
        isActive: openMap.is_active
      }));

      console.log(`✅ ${openMapData.length} données OpenMap récupérées pour l'utilisateur: ${userId}`);
      return openMapData;

    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des données OpenMap pour l'utilisateur ${userId}:`, error);
      return [];
    }
  }

  /**
   * Récupère le coffre au trésor et les référents de l'utilisateur (données complètes, structure masquée)
   */
  private async getExportTreasureChest(userId: string): Promise<AnonymizedUserDataExport['treasureChest']> {
    try {
      console.log(`🔍 Récupération du coffre au trésor pour l'utilisateur: ${userId}`);

      // Récupérer le coffre au trésor de l'utilisateur
      const { data: treasureChestData, error: treasureChestError } = await this.supabaseService.getSupabaseClient()
        .from('treasure_chests')
        .select(`
          id,
          user_id,
          balance,
          total_earned,
          created_at,
          blocked_amount
        `)
        .eq('user_id', userId)
        .single();

      if (treasureChestError) {
        console.error('Erreur lors de la récupération du coffre au trésor:', treasureChestError);
        // Retourner un coffre vide si pas trouvé
        return {
          id: '',
          userId: userId,
          balance: 0,
          totalEarned: 0,
          createdAt: new Date().toISOString(),
          blockedAmount: 0,
          referrals: []
        };
      }

      if (!treasureChestData) {
        return {
          id: '',
          userId: userId,
          balance: 0,
          totalEarned: 0,
          createdAt: new Date().toISOString(),
          blockedAmount: 0,
          referrals: []
        };
      }

      // Récupérer les référents du coffre au trésor
      const { data: referralsData, error: referralsError } = await this.supabaseService.getSupabaseClient()
        .from('treasure_chests_referrals')
        .select(`
          treasure_chest_id,
          referenced_user_id,
          subscription_type,
          amount,
          date_referred,
          created_at,
          amount_offered
        `)
        .eq('treasure_chest_id', treasureChestData.id)
        .order('created_at', { ascending: false });

      if (referralsError) {
        console.error('Erreur lors de la récupération des référents:', referralsError);
      }

      const referrals = referralsData || [];

      // Mapper les données vers un format qui ne révèle pas la structure de la table
      const treasureChest: AnonymizedUserDataExport['treasureChest'] = {
        id: String(treasureChestData.id),
        userId: String(treasureChestData.user_id),
        balance: Number(treasureChestData.balance || 0),
        totalEarned: Number(treasureChestData.total_earned || 0),
        createdAt: String(treasureChestData.created_at),
        blockedAmount: Number(treasureChestData.blocked_amount || 0),
        referrals: referrals.map(referral => ({
          treasureChestId: String(referral.treasure_chest_id),
          referencedUserId: String(referral.referenced_user_id),
          dateReferred: String(referral.date_referred),
          createdAt: String(referral.created_at),
          amountOffered: Number(referral.amount_offered || 0),
          ...(referral.subscription_type && { subscriptionType: String(referral.subscription_type) }),
          ...(referral.amount && { amount: Number(referral.amount) })
        }))
      };

      console.log(`✅ Coffre au trésor récupéré pour l'utilisateur: ${userId} (${referrals.length} référents)`);
      return treasureChest;

    } catch (error) {
      console.error(`❌ Erreur lors de la récupération du coffre au trésor pour l'utilisateur ${userId}:`, error);
      return {
        id: '',
        userId: userId,
        balance: 0,
        totalEarned: 0,
        createdAt: new Date().toISOString(),
        blockedAmount: 0,
        referrals: []
      };
    }
  }


  /**
   * Récupère les événements utilisateur (données complètes, structure masquée)
   */
  private async getExportUserEvents(userId: string): Promise<AnonymizedUserDataExport['userEvents']> {
    try {
      console.log(`🔍 Récupération des événements utilisateur pour l'utilisateur: ${userId}`);

      const { data, error } = await this.supabaseService.getSupabaseClient()
        .from('user_event')
        .select(`
          id,
          user_id,
          phone,
          title,
          message,
          message_data,
          redirection_url,
          fcm_token,
          status,
          archived,
          created_at,
          updated_at,
          fail_reason
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur lors de la récupération des événements utilisateur:', error);
        return [];
      }

      if (!data) {
        return [];
      }

      // Mapper les données vers un format qui ne révèle pas la structure de la table
      const userEvents = data.map(event => ({
        id: String(event.id),
        userId: String(event.user_id),
        ...(event.phone && { phone: String(event.phone) }),
        ...(event.title && { title: String(event.title) }),
        message: String(event.message),
        ...(event.message_data && { messageData: event.message_data }),
        ...(event.redirection_url && { redirectionUrl: String(event.redirection_url) }),
        ...(event.fcm_token && { fcmToken: String(event.fcm_token) }),
        status: String(event.status),
        archived: Boolean(event.archived),
        createdAt: String(event.created_at),
        updatedAt: String(event.updated_at),
        ...(event.fail_reason && { failReason: String(event.fail_reason) })
      }));

      console.log(`✅ ${userEvents.length} événements utilisateur récupérés pour l'utilisateur: ${userId}`);
      return userEvents;

    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des événements utilisateur pour l'utilisateur ${userId}:`, error);
      return [];
    }
  }

  /**
   * Transforme les spécialités de la base de données vers le format camelCase
   */
  private transformSpecialties(specialties: any): { choice: string[]; created: string[] } | undefined {
    if (!specialties) return undefined;
    
    // Si c'est déjà un objet avec choice/created (nouveau format)
    if (specialties.choice || specialties.created) {
      return {
        choice: Array.isArray(specialties.choice) ? specialties.choice : [],
        created: Array.isArray(specialties.created) ? specialties.created : []
      };
    }
    
    // Si c'est un tableau (ancien format), le convertir
    if (Array.isArray(specialties)) {
      return {
        choice: specialties,
        created: []
      };
    }
    
    // Fallback
    return {
      choice: [],
      created: []
    };
  }

  /**
   * Transforme les diplômes de la base de données vers le format Experience[]
   */
  private transformDiplomas(diplomas: any): Array<{ ecole: string; annee: string; intitule: string; duree: string }> | undefined {
    if (!diplomas) return undefined;

    if (Array.isArray(diplomas)) {
      return diplomas.map(diploma => ({
        ecole: String(diploma.ecole),
        annee: String(diploma.annee),
        intitule: String(diploma.intitule),
        duree: String(diploma.duree)
      }));
    }

    return undefined;
  }

  /**
   * Transforme la progression des titres de la base de données vers le format camelCase
   */
  private transformTitleProgression(titleProgression: any): Array<{ title: string; percent: number; category: string; started_at: string; updated_at: string }> | undefined {
    if (!titleProgression) return undefined;
    
    // Si c'est déjà un array (nouveau format)
    if (Array.isArray(titleProgression)) {
      return titleProgression.map(item => ({
        title: String(item.title),
        percent: Number(item.percent || 0),
        category: String(item.category || 'hower'),
        started_at: String(item.started_at || new Date().toISOString()),
        updated_at: String(item.updated_at || new Date().toISOString())
      }));
    }
    
    // Si c'est un objet simple (ancien format), le convertir en array
    if (typeof titleProgression === 'object' && titleProgression.title) {
      return [{
        title: String(titleProgression.title),
        percent: Number(titleProgression.percent || 0),
        category: String(titleProgression.category || 'hower'),
        started_at: String(titleProgression.started_at || new Date().toISOString()),
        updated_at: String(titleProgression.updated_at || new Date().toISOString())
      }];
    }
    
    // Fallback
    return [];
  }

  /**
   * Transforme les statistiques de snake_case vers camelCase
   */
  private transformStatisticsToCamelCase(dbStats: any): { rendezvousPraticien: number; rendezvousPraticienDone: number; userRendezVousPraticien: number; praticienRevenu: number; userRendezVousGuest: number } | undefined {
    if (!dbStats) return undefined;
    
    return {
      rendezvousPraticien: Number(dbStats.rendezvous_praticien || 0),
      rendezvousPraticienDone: Number(dbStats.rendezvous_praticien_done || 0),
      userRendezVousPraticien: Number(dbStats.user_rendezvous_praticien || 0),
      praticienRevenu: Number(dbStats.praticien_revenu || 0),
      userRendezVousGuest: Number(dbStats.user_rendezvous_guest || 0)
    };
  }

  /**
   * Calcule les métadonnées de l'export anonymisé
   */
  private calculateAnonymizedMetadata(
    bilans: AnonymizedUserDataExport['bilans'],
    activities: AnonymizedUserDataExport['activities'],
    activityRequestedModifications: AnonymizedUserDataExport['activityRequestedModifications'],
    aiResponses: AnonymizedUserDataExport['aiResponses'],
    howanaConversations: AnonymizedUserDataExport['howanaConversations'],
    rendezVous: AnonymizedUserDataExport['rendezVous'],
    deliveries: AnonymizedUserDataExport['deliveries'],
    emails: AnonymizedUserDataExport['emails'],
    feedbacks: AnonymizedUserDataExport['feedbacks'],
    openMapData: AnonymizedUserDataExport['openMapData'],
    treasureChest: AnonymizedUserDataExport['treasureChest'],
    userEvents: AnonymizedUserDataExport['userEvents'],
    userProfile: AnonymizedUserDataExport['userProfile']
  ): AnonymizedUserDataExport['metadata'] {
    const dataSize = this.calculateAnonymizedDataSize(
      bilans, 
      activities, activityRequestedModifications, aiResponses, 
      howanaConversations, rendezVous, deliveries, emails, feedbacks, openMapData, treasureChest, userEvents, userProfile
    );

    return {
      totalBilans: bilans.length,
      totalActivities: activities.length,
      totalActivityRequestedModifications: activityRequestedModifications.length,
      totalAiResponses: aiResponses.length,
      totalHowanaConversations: howanaConversations.length,
      totalRendezVous: rendezVous.length,
      totalDeliveries: deliveries.length,
      totalEmails: emails.length,
      totalFeedbacks: feedbacks.length,
      totalOpenMapData: openMapData.length,
      totalTreasureChestReferrals: treasureChest.referrals.length,
      totalUserEvents: userEvents.length,
      exportDate: new Date().toISOString(),
      dataSize: `${dataSize} MB`
    };
  }

  /**
   * Calcule la taille approximative des données anonymisées
   */
  private calculateAnonymizedDataSize(
    bilans: AnonymizedUserDataExport['bilans'],
    activities: AnonymizedUserDataExport['activities'],
    activityRequestedModifications: AnonymizedUserDataExport['activityRequestedModifications'],
    aiResponses: AnonymizedUserDataExport['aiResponses'],
    howanaConversations: AnonymizedUserDataExport['howanaConversations'],
    rendezVous: AnonymizedUserDataExport['rendezVous'],
    deliveries: AnonymizedUserDataExport['deliveries'],
    emails: AnonymizedUserDataExport['emails'],
    feedbacks: AnonymizedUserDataExport['feedbacks'],
    openMapData: AnonymizedUserDataExport['openMapData'],
    treasureChest: AnonymizedUserDataExport['treasureChest'],
    userEvents: AnonymizedUserDataExport['userEvents'],
    userProfile: AnonymizedUserDataExport['userProfile']
  ): number {
    // Estimation approximative de la taille des données anonymisées

    const bilanSize = bilans.reduce((acc, bilan) => acc + bilan.content.length, 0);
    const aiResponseSize = aiResponses.reduce((acc, response) => acc + response.responseText.length, 0);

    // Estimation pour les activités et pratiques (contenu textuel)
    const activitySize = activities.reduce((acc, activity) => {
      return acc + (activity.title?.length || 0) + (activity.description?.length || 0);
    }, 0);

    const activityModificationSize = activityRequestedModifications.reduce((acc, modification) => {
      return acc + (modification.title?.length || 0) + (modification.shortDescription?.length || 0) + (modification.longDescription?.length || 0);
    }, 0);

    // Estimation pour les conversations Howana (contexte JSON)
    const howanaSize = howanaConversations.reduce((acc, conv) => {
      return acc + (conv.context ? JSON.stringify(conv.context).length : 0);
    }, 0);

    // Estimation pour les rendez-vous (métadonnées et participants)
    const rendezVousSize = rendezVous.reduce((acc, rv) => {
      let size = 0;
      
      // Taille des données de base du rendez-vous
      size += (rv.date?.length || 0) + (rv.status?.length || 0);
      
      // Taille des données de l'utilisateur dans ce rendez-vous
      if (rv.userRendezVous) {
        size += (rv.userRendezVous.firstName?.length || 0) + 
                (rv.userRendezVous.lastName?.length || 0) + 
                (rv.userRendezVous.email?.length || 0) + 
                (rv.userRendezVous.phone?.length || 0) + 
                (rv.userRendezVous.reductionType?.length || 0);
      }
      
      // Taille de tous les participants
      if (rv.allParticipants) {
        size += rv.allParticipants.reduce((participantAcc, participant) => {
          return participantAcc + (participant.firstName?.length || 0) + 
                 (participant.lastName?.length || 0) + 
                 (participant.email?.length || 0) + 
                 (participant.phone?.length || 0) + 
                 (participant.reductionType?.length || 0);
        }, 0);
      }
      
      return acc + size;
    }, 0);

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

    // Estimation pour les données OpenMap (profil, localisation, expérience)
    const openMapSize = openMapData.reduce((acc, openMap) => {
      return acc + (openMap.firstName?.length || 0) + (openMap.lastName?.length || 0) + 
             (openMap.email?.length || 0) + (openMap.phone?.length || 0) + 
             (openMap.experience?.length || 0) + (openMap.vectorSummary?.length || 0) +
             (openMap.specialties ? JSON.stringify(openMap.specialties).length : 0) + 
             (openMap.gpsLocation ? JSON.stringify(openMap.gpsLocation).length : 0) + 
             (openMap.address ? JSON.stringify(openMap.address).length : 0) +
             (openMap.diplomas ? JSON.stringify(openMap.diplomas).length : 0) + 
             (openMap.titleProgression ? JSON.stringify(openMap.titleProgression).length : 0);
    }, 0);

    // Estimation pour le coffre au trésor (données financières et référents)
    const treasureChestSize = treasureChest.referrals.reduce((acc, referral) => {
      return acc + (referral.subscriptionType?.length || 0) + 
             (referral.amount?.toString().length || 0) + 
             (referral.amountOffered.toString().length || 0);
    }, 0) + treasureChest.balance.toString().length + 
      treasureChest.totalEarned.toString().length + 
      treasureChest.blockedAmount.toString().length;

    // Estimation pour les événements utilisateur (messages, données JSON)
    const userEventsSize = userEvents.reduce((acc, event) => {
      return acc + (event.title?.length || 0) + 
             event.message.length + 
             (event.phone?.length || 0) + 
             (event.redirectionUrl?.length || 0) + 
             (event.fcmToken?.length || 0) + 
             (event.failReason?.length || 0) +
             (event.messageData ? JSON.stringify(event.messageData).length : 0);
    }, 0);

    // Estimation pour les données utilisateur (profil complet)
    const userProfileSize = (userProfile.firstName?.length || 0) + 
                              (userProfile.lastName?.length || 0) + 
                              (userProfile.email?.length || 0) + 
                              (userProfile.phone?.length || 0) + 
                              (userProfile.experience?.length || 0) + 
                              (userProfile.typicalSituations?.length || 0) +
                              (userProfile.howanaRecommandation?.length || 0) +
                              (userProfile.specialties ? JSON.stringify(userProfile.specialties).length : 0) +
                              (userProfile.diplomas ? JSON.stringify(userProfile.diplomas).length : 0) +
                              (userProfile.titleProgression ? JSON.stringify(userProfile.titleProgression).length : 0) +
                              (userProfile.address ? JSON.stringify(userProfile.address).length : 0) +
                              (userProfile.preferences ? JSON.stringify(userProfile.preferences).length : 0) +
                              (userProfile.favourites ? JSON.stringify(userProfile.favourites).length : 0) +
                              (userProfile.statistics ? JSON.stringify(userProfile.statistics).length : 0) +
                              (userProfile.pendingModificationData ? JSON.stringify(userProfile.pendingModificationData).length : 0);

    const totalBytes = bilanSize + aiResponseSize + activitySize + 
                      activityModificationSize + howanaSize + 
                      rendezVousSize + deliverySize + emailSize + feedbackSize + openMapSize + treasureChestSize + userEventsSize + userProfileSize;
    return Math.round(totalBytes / (1024 * 1024) * 100) / 100; // Conversion en MB
  }
}
