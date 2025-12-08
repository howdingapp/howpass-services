import { Request, Response } from 'express';
import { ChatBotServiceFactory } from '../services/ChatBotServiceFactory';
import { BaseChatBotService } from '../services/BaseChatBotService';
import { ConversationService } from '../services/ConversationService';
import { SupabaseService } from '../services/SupabaseService';
import { HowanaContext } from '../types/repositories';
import { IAAuthenticatedRequest } from '../middleware/iaAuthMiddleware';

interface IATaskRequest {
  type: 'generate_response' | 'generate_summary' | 'generate_first_response' | 'generate_unfinished_exchange';
  conversationId: string;
  userId: string;
  userMessage?: string;
  priority?: 'low' | 'medium' | 'high';
  aiResponseId?: string; // ID de l'entrée ai_response pré-créée
  lastAnswer?: string; // Dernière réponse de l'utilisateur pour les échanges non finis
}

export class IAController {
  private conversationService: ConversationService;
  private supabaseService: SupabaseService;

  constructor() {
    this.conversationService = new ConversationService();
    this.supabaseService = new SupabaseService();
  }


  /**
   * Obtenir le service de chatbot approprié selon le type de conversation
   */
  private getChatBotService(context: HowanaContext): BaseChatBotService {
    const service = ChatBotServiceFactory.createService(context);
    console.log(`🤖 Service de chatbot créé: ${service.constructor.name} pour le type: ${context.type}`);
    return service;
  }

  /**
   * Vérifie si la réponse IA est un résumé
   */
  private isSummary(iaResponse: any): boolean {
    return iaResponse.type === 'summary' || iaResponse.message_type === 'summary';
  }

  /**
   * Vérifier si l'utilisateur a atteint la limite journalière de messages
   * Cette vérification s'applique uniquement pour les conversations de type 'recommandation'
   */
  private async checkDailyMessageLimit(userId: string, conversationType: string): Promise<boolean> {
    // Ne vérifier la limite que pour les conversations de type 'recommandation'
    if (conversationType !== 'recommandation') {
      return false;
    }

    try {
      // Vérifier si l'utilisateur est dans la liste des emails de développement
      const emailResult = await this.supabaseService.getUserEmail(userId);
      if (emailResult.success && emailResult.email) {
        const devEmails = process.env['DEV_EMAIL']?.split(';').map(email => email.trim()) || [];
        if (devEmails.includes(emailResult.email)) {
          console.log(`🔓 Utilisateur de développement détecté (${emailResult.email}), aucune limite appliquée`);
          return false; // Pas de limite pour les emails de développement
        }
      }

      // Récupérer le profil de l'utilisateur pour déterminer la limite
      const profilResult = await this.supabaseService.getUserProfil(userId);
      if (!profilResult.success) {
        console.warn('⚠️ Impossible de récupérer le profil utilisateur, utilisation de la limite par défaut (non-free)');
      }

      const isFree = profilResult.profil === 'free';
      
      // Déterminer la limite selon le profil
      const maxDailyMessages = isFree 
        ? parseInt(process.env['MAX_DAILY_MESSAGES_FREE'] || '10', 10)
        : parseInt(process.env['MAX_DAILY_MESSAGES'] || '30', 10);

      // Compter uniquement les messages des conversations de type 'recommandation'
      const result = await this.supabaseService.countTodayValidRecommandationMessagesByUserId(userId);
      if (!result.success) {
        console.error('❌ Erreur lors de la récupération du nombre de messages valides de recommandation du jour');
        throw new Error(`Impossible de récupérer le nombre de messages valides: ${result.error || 'Erreur inconnue'}`);
      }

      const todayMessagesCount = result.count || 0;
      const hasReachedLimit = todayMessagesCount >= maxDailyMessages;
      
      if (hasReachedLimit) {
        console.log(`⚠️ Limite journalière de messages atteinte: ${todayMessagesCount}/${maxDailyMessages} pour l'utilisateur ${userId} (profil: ${profilResult.profil || 'unknown'})`);
      } else {
        console.log(`📊 Nombre de messages valides de recommandation aujourd'hui: ${todayMessagesCount}/${maxDailyMessages} pour l'utilisateur ${userId} (profil: ${profilResult.profil || 'unknown'})`);
      }
      
      return hasReachedLimit;
    } catch (error) {
      console.error('❌ Erreur lors de la vérification de la limite journalière de messages:', error);
      return false;
    }
  }

  /**
   * Parser la limite de bilan au format 'nombre1:nombre2:type'
   * Exemples: '1:7:day' (1 bilan tous les 7 jours), '2:1:week' (2 bilans toutes les 1 semaine), '1:1:month' (1 bilan depuis le début du mois courant), '1:1:year' (1 bilan depuis le début de l'année courante)
   * Retourne [maxBilans, periodCount, periodType]
   */
  private parseBilanLimit(limitString: string): [number, number, 'day' | 'week' | 'month' | 'year'] {
    const parts = limitString.split(':');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      // Format invalide, utiliser les valeurs par défaut
      console.warn(`⚠️ Format de limite de bilan invalide: ${limitString}, utilisation de 1:1:week par défaut`);
      return [1, 1, 'week'];
    }

    const maxBilans = parseInt(parts[0].trim(), 10);
    const periodCount = parseInt(parts[1].trim(), 10);
    const periodType = parts[2].trim().toLowerCase() as 'day' | 'week' | 'month' | 'year';

    if (isNaN(maxBilans) || maxBilans < 1) {
      console.warn(`⚠️ Nombre de bilans invalide: ${parts[0]}, utilisation de 1 par défaut`);
      return [1, periodCount || 1, periodType === 'day' || periodType === 'month' || periodType === 'year' ? periodType : 'week'];
    }

    if (isNaN(periodCount) || periodCount < 1) {
      console.warn(`⚠️ Nombre de périodes invalide: ${parts[1]}, utilisation de 1 par défaut`);
      return [maxBilans, 1, periodType === 'day' || periodType === 'month' || periodType === 'year' ? periodType : 'week'];
    }

    if (periodType !== 'day' && periodType !== 'week' && periodType !== 'month' && periodType !== 'year') {
      console.warn(`⚠️ Type de période invalide: ${periodType}, utilisation de 'week' par défaut`);
      return [maxBilans, periodCount, 'week'];
    }

    return [maxBilans, periodCount, periodType];
  }

  /**
   * Vérifier si l'utilisateur a atteint la limite de bilans selon la période
   * Cette vérification s'applique uniquement pour les conversations de type 'bilan'
   * @param userId - ID de l'utilisateur
   * @param conversationType - Type de conversation
   * @param excludeConversationID - ID de la conversation à exclure du comptage (le bilan actuel)
   */
  private async checkBilanLimit(userId: string, conversationType: string, excludeConversationID?: string): Promise<boolean> {
    // Ne vérifier la limite que pour les conversations de type 'bilan'
    if (conversationType !== 'bilan') {
      return false;
    }

    try {
      // Vérifier si l'utilisateur est dans la liste des emails de développement
      const emailResult = await this.supabaseService.getUserEmail(userId);
      if (emailResult.success && emailResult.email) {
        const devEmails = process.env['DEV_EMAIL']?.split(';').map(email => email.trim()) || [];
        if (devEmails.includes(emailResult.email)) {
          console.log(`🔓 Utilisateur de développement détecté (${emailResult.email}), aucune limite appliquée`);
          return false; // Pas de limite pour les emails de développement
        }
      }

      // Récupérer le profil de l'utilisateur pour déterminer la limite
      const profilResult = await this.supabaseService.getUserProfil(userId);
      if (!profilResult.success) {
        console.warn('⚠️ Impossible de récupérer le profil utilisateur, utilisation de la limite par défaut (non-free)');
      }

      const isFree = profilResult.profil === 'free';
      
      // Déterminer la limite selon le profil (format 'nombre1:nombre2:type')
      const bilanLimitEnv = isFree 
        ? (process.env['MAX_BILAN_FREE'] || '1:1:year')
        : (process.env['MAX_BILAN'] || '1:2:week');
      
      const [maxBilans, periodCount, periodType] = this.parseBilanLimit(bilanLimitEnv);
      
      // Compter les bilans dans la période en excluant la conversation actuelle
      const result = await this.supabaseService.countBilanConversationsByUserIdInPeriod(
        userId, 
        periodCount, 
        periodType,
        excludeConversationID
      );
      if (!result.success) {
        console.error('❌ Erreur lors de la récupération du nombre de bilans dans la période');
        throw new Error(`Impossible de récupérer le nombre de bilans: ${result.error || 'Erreur inconnue'}`);
      }

      const bilanCount = result.count || 0;
      const hasReachedLimit = bilanCount >= maxBilans;
      
      if (hasReachedLimit) {
        const periodText = periodType === 'day' 
          ? (periodCount === 1 ? 'aujourd\'hui' : `sur les ${periodCount} derniers jours`)
          : periodType === 'week'
          ? (periodCount === 1 ? 'cette semaine' : `sur les ${periodCount} dernières semaines`)
          : periodType === 'month'
          ? (periodCount === 1 ? 'ce mois' : `sur les ${periodCount} derniers mois`)
          : (periodCount === 1 ? 'cette année' : `sur les ${periodCount} dernières années`);
        console.log(`⚠️ Limite de bilans atteinte: ${bilanCount}/${maxBilans} ${periodText} pour l'utilisateur ${userId} (profil: ${profilResult.profil || 'unknown'})`);
      } else {
        const periodText = periodType === 'day' 
          ? (periodCount === 1 ? 'aujourd\'hui' : `sur les ${periodCount} derniers jours`)
          : periodType === 'week'
          ? (periodCount === 1 ? 'cette semaine' : `sur les ${periodCount} dernières semaines`)
          : periodType === 'month'
          ? (periodCount === 1 ? 'ce mois' : `sur les ${periodCount} derniers mois`)
          : (periodCount === 1 ? 'cette année' : `sur les ${periodCount} dernières années`);
        console.log(`📊 Nombre de bilans ${periodText}: ${bilanCount}/${maxBilans} pour l'utilisateur ${userId} (profil: ${profilResult.profil || 'unknown'})`);
      }
      
      return hasReachedLimit;
    } catch (error) {
      console.error('❌ Erreur lors de la vérification de la limite de bilans:', error);
      return false;
    }
  }

  /**
   * Traiter une tâche IA reçue de Google Cloud Tasks
   */
  async processIATask(req: IAAuthenticatedRequest, res: Response): Promise<void> {
    try {
      console.log('🚀 Tâche IA reçue:', req.body);
      
      // Le token a déjà été validé par le middleware
      const authToken = req.validatedAuthToken;
      
      if (!authToken) {
        console.error('❌ Token d\'authentification manquant après validation');
        res.status(401).json({
          error: 'Token d\'authentification manquant',
          message: 'Le token d\'authentification est requis'
        });
        return;
      }

      const taskData = req.body as IATaskRequest;
      
      // Validation supplémentaire des données
      if (!taskData.type || !taskData.conversationId) {
        console.error('❌ Données de tâche incomplètes:', taskData);
        res.status(400).json({
          error: 'Données de tâche incomplètes',
          message: 'Les champs type et conversationId sont requis'
        });
        return;
      }

      // Vérifier que la conversation existe et récupérer le contexte Howana
      const context = await this.conversationService.getContext(taskData.conversationId);
      if (!context) {
        console.error(`❌ Contexte Howana non trouvé: ${taskData.conversationId}`);
        res.status(404).json({
          error: 'Contexte non trouvé',
          message: `Le contexte de la conversation ${taskData.conversationId} n'existe pas`
        });
        return;
      }

      // Valider le type de conversation
      if (!ChatBotServiceFactory.isSupportedType(context.type)) {
        console.error(`❌ Type de conversation non supporté: ${context.type}`);
        res.status(400).json({
          error: 'Type de conversation non supporté',
          message: `Le type '${context.type}' n'est pas supporté. Types supportés: ${ChatBotServiceFactory.getSupportedTypes().join(', ')}`
        });
        return;
      }

      console.log(`🎯 Traitement de la tâche IA: ${taskData.type} pour ${taskData.conversationId}`);
      console.log(`🏷️ Type de conversation: ${context.type}`);

      console.log('🔍 Contexte de la conversation:', context);

      // Vérifier les limites pour les tâches de type generate_response
      // Si la limite est atteinte, forcer la génération d'un résumé
      // Pour les recommandations : vérifier la limite de messages journaliers
      // Pour les bilans : vérifier la limite de bilans selon la période
      // Les administrateurs n'ont pas de limites
      if (taskData.type === 'generate_response') {
        // Vérifier si l'utilisateur est admin
        const userRoleResult = await this.supabaseService.getUserRole(req.user?.userId || '');
        const isAdmin = userRoleResult.success && userRoleResult.role === 'admin';

        if (!isAdmin) {
          // Vérifier la limite de messages pour les recommandations
          const hasReachedDailyLimit = await this.checkDailyMessageLimit(req.user?.userId || '', context.type);
          if (hasReachedDailyLimit) {
            console.log(`🔄 Limite journalière de messages atteinte, conversion de generate_response en generate_summary`);
            taskData.type = 'generate_summary';
          }
          
          // Vérifier la limite de bilans pour les bilans (en excluant la conversation actuelle)
          const hasReachedBilanLimit = await this.checkBilanLimit(req.user?.userId || '', context.type, taskData.conversationId);
          if (hasReachedBilanLimit) {
            console.log(`🔄 Limite de bilans atteinte, conversion de generate_response en generate_summary`);
            taskData.type = 'generate_summary';
          }
        } else {
          console.log(`👑 Utilisateur admin détecté, aucune limite appliquée`);
        }
      }

      // Mesurer le temps de traitement
      const startTime = Date.now();

      // Traiter selon le type de tâche
      let result: { updatedContext: HowanaContext; iaResponse: any };
      
      switch (taskData.type) {
        case 'generate_response':
          result = await this.processGenerateResponse(req, taskData, context);
          break;
        case 'generate_summary':
          result = await this.processGenerateSummary(req, taskData, context);
          break;
        case 'generate_first_response':
          result = await this.processGenerateFirstResponse(req, taskData, context);
          break;
        case 'generate_unfinished_exchange':
          result = await this.processGenerateUnfinishedExchange(req, taskData, context);
          break;
        default:
          console.error('❌ Type de tâche non reconnu:', taskData.type);
          res.status(400).json({
            error: 'Type de tâche non reconnu',
            message: `Le type '${taskData.type}' n'est pas supporté`
          });
          return;
      }

      // Obtenir le service de chatbot pour onTaskFinish
      const chatBotService = this.getChatBotService(result.updatedContext);

      // Calculer le temps de traitement en secondes
      const endTime = Date.now();
      const processingTimeSeconds = (endTime - startTime) / 1000;

      // Finaliser la tâche avec la mise à jour de la base de données
      await this.finalizeTask(taskData, result.updatedContext, result.iaResponse, chatBotService, processingTimeSeconds);

      console.log(`✅ Tâche IA traitée avec succès: ${taskData.type}`);
      res.status(200).json({
        success: true,
        message: `Tâche ${taskData.type} traitée avec succès`,
        conversationId: taskData.conversationId,
        type: taskData.type
      });

    } catch (error) {
      console.error('❌ Erreur lors du traitement de la tâche IA:', error);
      res.status(500).json({
        error: 'Erreur interne',
        message: 'Une erreur est survenue lors du traitement de la tâche IA'
      });
    }
  }

  /**
   * Fonction centralisée pour finaliser une tâche IA
   * Met à jour le contexte et la réponse IA en une seule opération
   */
  private async finalizeTask(
    taskData: IATaskRequest, 
    updatedContext: HowanaContext, 
    iaResponse: any, 
    chatBotService: BaseChatBotService,
    processingTimeSeconds: number
  ): Promise<void> {
    try {
      console.log(`🔄 Finalisation de la tâche ${taskData.type} pour ${taskData.conversationId}`);

      // Mettre à jour le contexte en base de données
      const contextUpdateResult = await this.supabaseService.updateContext(taskData.conversationId, updatedContext);
      if (!contextUpdateResult.success) {
        console.error('❌ Erreur lors de la mise à jour du contexte:', contextUpdateResult.error);
        throw new Error(`Erreur lors de la mise à jour du contexte: ${contextUpdateResult.error}`);
      }
      console.log('✅ Contexte mis à jour en base de données');

      // 1. Récupérer l'ID de la réponse (soit celui de la tâche, soit celui du contexte)
      // finalizeTask ne crée jamais, elle utilise uniquement l'ID existant
      let aiResponseId: string | undefined = taskData.aiResponseId;
      
      // Si pas d'ID dans la tâche, essayer de le récupérer depuis le contexte
      if (!aiResponseId && updatedContext.metadata?.['lastIntermediateAiResponseId']) {
        aiResponseId = updatedContext.metadata['lastIntermediateAiResponseId'] as string;
      }
      
      if (!aiResponseId) {
        throw new Error('❌ Aucun aiResponseId disponible (ni dans taskData, ni dans le contexte)');
      }

      // 2. Extraire les tokens depuis iaResponse (séparés en input, cached_input, output)
      const responseCostInput = iaResponse.cost_input !== undefined && iaResponse.cost_input !== null ? iaResponse.cost_input : 0;
      const responseCostCachedInput = iaResponse.cost_cached_input !== undefined && iaResponse.cost_cached_input !== null ? iaResponse.cost_cached_input : 0;
      const responseCostOutput = iaResponse.cost_output !== undefined && iaResponse.cost_output !== null ? iaResponse.cost_output : 0;
      
      // Ajouter le coût de l'intent (seulement en input)
      const intentCost = (updatedContext.metadata?.['currentIntentInfos'] as any)?.intentCost as number | undefined ?? 0;
      const totalCostInput = responseCostInput + intentCost;

      // 3. Déterminer valid_for_limit : true uniquement si l'ID correspond à taskData.aiResponseId
      const validForLimit = aiResponseId === taskData.aiResponseId;

      // 4. Préparer les données de mise à jour
      const remainQuestion = updatedContext.type === 'bilan' 
        ? (updatedContext.metadata?.['remainBilanQuestion'] as number | undefined)
        : undefined;

      const updateData: any = {
        response_text: JSON.stringify(iaResponse),
        next_response_id: null, // Dernière réponse, pas de suivant
        cost_input: totalCostInput > 0 ? totalCostInput : null,
        cost_cached_input: responseCostCachedInput > 0 ? responseCostCachedInput : null,
        cost_output: responseCostOutput > 0 ? responseCostOutput : null,
        user_input_text: taskData.userMessage || null, // Message utilisateur qui a déclenché cette réponse
        valid_for_limit: validForLimit,
        metadata: {
          source: 'ai',
          model: chatBotService.getAIModel(),
          type: taskData.type,
          messageId: iaResponse.messageId,
          status: 'completed',
          recommendations: iaResponse.recommendations || updatedContext.recommendations || { activities: [], practices: [] },
          hasRecommendations: iaResponse.hasRecommendations || ((updatedContext.recommendations?.activities?.length || 0) > 0 || (updatedContext.recommendations?.practices?.length || 0) > 0),
          recommendationRequiredForSummary: chatBotService['recommendationRequiredForSummary'](updatedContext),
          ...(remainQuestion !== undefined && { remainQuestion })
        }
      };

      // Ajouter message_type seulement si c'est un summary
      if (this.isSummary(iaResponse)) {
        updateData.message_type = 'summary';
      }

      // 5. Faire un appel de mise à jour globale
      const updateResult = await this.supabaseService.updateAIResponse(aiResponseId, updateData);

      if (!updateResult.success) {
        console.error('❌ Erreur lors de la mise à jour de la réponse IA:', updateResult.error);
        throw new Error(`Erreur lors de la mise à jour de la réponse IA: ${updateResult.error}`);
      }

      // 5. Mettre à jour le compute_time de la conversation
      const computeTimeUpdateResult = await this.supabaseService.updateConversationComputeTime(
        taskData.conversationId,
        processingTimeSeconds
      );
      if (!computeTimeUpdateResult.success) {
        console.error('❌ Erreur lors de la mise à jour du compute_time:', computeTimeUpdateResult.error);
        // Ne pas faire échouer la requête si la mise à jour du compute_time échoue
      } else {
        console.log(`✅ Compute_time mis à jour: +${processingTimeSeconds}s`);
      }

      // 6. Marquer la conversation comme terminée si c'est un résumé ou un échange non fini
      if (taskData.type === 'generate_summary' || taskData.type === 'generate_unfinished_exchange') {
        const statusUpdateResult = await this.supabaseService.updateConversationStatus(taskData.conversationId, 'completed');
        if (!statusUpdateResult.success) {
          console.error('❌ Erreur lors de la mise à jour du status de la conversation:', statusUpdateResult.error);
          // Ne pas faire échouer la requête si la mise à jour du status échoue
        } else {
          console.log(`✅ Conversation ${taskData.conversationId} marquée comme terminée`);
        }
      }
      
      console.log(`✅ aiResponse mise à jour: ${aiResponseId}`);

      console.log(`✅ Tâche ${taskData.type} finalisée avec succès`);
    } catch (error) {
      console.error(`❌ Erreur lors de la finalisation de la tâche ${taskData.type}:`, error);
      throw error;
    }
  }

  /**
   * Fonction pour finaliser une réponse IA intermédiaire (avec next_response_id)
   * Met à jour le contexte et crée/met à jour l'entrée ai_response
   * Ne doit être appelée que pour les réponses intermédiaires
   */
  private async finalizeIntermediateResponse(
    req: IAAuthenticatedRequest,
    taskData: IATaskRequest,
    iaResponse: any,
    updatedContext: HowanaContext,
    chatBotService: BaseChatBotService,
    isFirstResponse: boolean
  ): Promise<string> {
    try {
      console.log(`🔄 Finalisation de la réponse IA intermédiaire (première: ${isFirstResponse})`);

      // 1. Récupérer la dernière réponse en cours de construction
      // Soit lastIntermediateAiResponseId du contexte, soit taskData.aiResponseId
      let aiResponseId: string | undefined = updatedContext.metadata?.['lastIntermediateAiResponseId'] as string | undefined;
      if (!aiResponseId) {
        aiResponseId = taskData.aiResponseId;
      }

      // On doit toujours avoir un aiResponseId à ce stade
      if (!aiResponseId) {
        throw new Error('❌ Aucun aiResponseId disponible (ni dans lastIntermediateAiResponseId du contexte, ni dans taskData.aiResponseId)');
      }

      // 2. Détecter s'il y aura une réponse suivante
      const hasNext = iaResponse.haveNext === true;
      
      let nextResponseId: string | null = null;
      let newIntermediateResponseId: string | undefined = undefined;

      // 3. Si on détecte qu'il y aura un next, créer une nouvelle réponse intermédiaire
      if (hasNext) {
        // Déterminer le message_type en fonction de la réponse actuelle
        const messageType = this.isSummary(iaResponse) ? 'summary' : 'text';
        const createNextResult = await this.supabaseService.createAIResponse({
          conversation_id: taskData.conversationId,
          user_id: req.user?.userId || '',
          response_text: null, // Réponse vide pour l'instant
          message_type: messageType,
          next_response_id: null
        } as any);

        if (!createNextResult.success) {
          console.error('❌ Erreur lors de la création de la prochaine réponse IA:', createNextResult.error);
          throw new Error(`Erreur lors de la création de la prochaine réponse IA: ${createNextResult.error}`);
        }

        if (!createNextResult.data?.id) {
          throw new Error('❌ ID non retourné après création de la prochaine réponse IA');
        }

        newIntermediateResponseId = createNextResult.data.id;
        nextResponseId = newIntermediateResponseId;
        console.log(`✅ Prochaine réponse intermédiaire créée: ${newIntermediateResponseId}`);

        // Mettre à jour le contexte avec le nouvel ID
        updatedContext.metadata = {
          ...updatedContext.metadata,
          ['lastIntermediateAiResponseId']: newIntermediateResponseId
        };
      }

      // 4. Extraire les tokens depuis iaResponse (séparés en input, cached_input, output)
      const responseCostInput = iaResponse.cost_input !== undefined && iaResponse.cost_input !== null ? iaResponse.cost_input : 0;
      const responseCostCachedInput = iaResponse.cost_cached_input !== undefined && iaResponse.cost_cached_input !== null ? iaResponse.cost_cached_input : 0;
      const responseCostOutput = iaResponse.cost_output !== undefined && iaResponse.cost_output !== null ? iaResponse.cost_output : 0;
      
      // Ajouter le coût de l'intent (seulement pour la première réponse, en input)
      const intentCost = isFirstResponse ? ((updatedContext.metadata?.['currentIntentInfos'] as any)?.intentCost as number | undefined ?? 0) : 0;
      const totalCostInput = responseCostInput + intentCost;

      // 5. Déterminer valid_for_limit : true uniquement si l'ID correspond à taskData.aiResponseId
      const validForLimit = aiResponseId === taskData.aiResponseId;

      // 6. Préparer les données de mise à jour
      const remainQuestion = updatedContext.type === 'bilan' 
        ? (updatedContext.metadata?.['remainBilanQuestion'] as number | undefined)
        : undefined;

      const updateData: any = {
        response_text: JSON.stringify(iaResponse),
        next_response_id: nextResponseId,
        cost_input: totalCostInput > 0 ? totalCostInput : null,
        cost_cached_input: responseCostCachedInput > 0 ? responseCostCachedInput : null,
        cost_output: responseCostOutput > 0 ? responseCostOutput : null,
        user_input_text: taskData.userMessage || null, // Message utilisateur qui a déclenché cette réponse
        valid_for_limit: validForLimit,
        metadata: {
          source: 'ai',
          model: chatBotService.getAIModel(),
          type: isFirstResponse ? taskData.type : 'generate_response',
          messageId: iaResponse.messageId,
          status: 'completed',
          recommendations: iaResponse.recommendations || updatedContext.recommendations || { activities: [], practices: [] },
          hasRecommendations: iaResponse.hasRecommendations || ((updatedContext.recommendations?.activities?.length || 0) > 0 || (updatedContext.recommendations?.practices?.length || 0) > 0),
          recommendationRequiredForSummary: chatBotService['recommendationRequiredForSummary'](updatedContext),
          ...(remainQuestion !== undefined && { remainQuestion })
        }
      };

      // Ajouter message_type seulement si c'est un summary
      if (this.isSummary(iaResponse)) {
        updateData.message_type = 'summary';
      }

      // 7. Mettre à jour les informations de la réponse actuelle
      const updateResult = await this.supabaseService.updateAIResponse(aiResponseId, updateData);

      if (!updateResult.success) {
        console.error('❌ Erreur lors de la mise à jour de la réponse IA:', updateResult.error);
        throw new Error(`Erreur lors de la mise à jour de la réponse IA: ${updateResult.error}`);
      }

      // 7. Mettre à jour le contexte en base de données
      const contextUpdateResult = await this.supabaseService.updateContext(taskData.conversationId, updatedContext);
      if (!contextUpdateResult.success) {
        console.error('❌ Erreur lors de la mise à jour du contexte:', contextUpdateResult.error);
        throw new Error(`Erreur lors de la mise à jour du contexte: ${contextUpdateResult.error}`);
      }
      console.log('✅ Contexte mis à jour en base de données');
      
      console.log(`✅ aiResponse mise à jour: ${aiResponseId}${hasNext ? `, prochaine réponse préparée: ${newIntermediateResponseId}` : ''}`);
      
      // Retourner l'ID de cette réponse pour la chaîne suivante
      return aiResponseId;
    } catch (error) {
      console.error('❌ Erreur lors de la finalisation de la réponse IA intermédiaire:', error);
      throw error;
    }
  }

  /**
   * Traiter la génération d'une première réponse IA
   */
  private async processGenerateFirstResponse(_req: IAAuthenticatedRequest, taskData: IATaskRequest, context: HowanaContext): Promise<{ updatedContext: HowanaContext; iaResponse: any }> {
    console.log(`👋 Génération d'une première réponse IA pour: ${taskData.conversationId}`);
    
    // Obtenir le service de chatbot approprié
    const chatBotService = this.getChatBotService(context);
    
    const firstResponseResult = await chatBotService.generateFirstResponse(context);
    
    // Mettre à jour le contexte avec les nouvelles informations
    let updatedContext = { ...context };
    updatedContext.previousCallId = firstResponseResult.messageId;
    updatedContext.previousResponse = firstResponseResult.response;
    
    // Utiliser le contexte mis à jour depuis la réponse si disponible
    if (firstResponseResult.updatedContext) {
      updatedContext = firstResponseResult.updatedContext;
    }

    // Créer l'objet de réponse IA initial
    let iaResponse: any = {
      ...firstResponseResult,
      messageId: firstResponseResult.messageId || `msg_${Date.now()}`,
      type: 'first_response',
      recommendations: context.recommendations || { activities: [], practices: [] },
      hasRecommendations: context.hasRecommendations || false
    };

    // Valider et corriger la première réponse
    // La validation est normalement faite dans chaque service via validateFirstResponse
    console.log('🔍 Validation de la première réponse');
    const validation = await chatBotService.validateFirstResponse(iaResponse, updatedContext);
    
    if (validation.isValid) {
      // Si un finalObject est fourni, l'utiliser (réponse corrigée)
      if (validation.finalObject) {
        console.log('✅ Validation réussie avec finalObject fourni (réponse corrigée)');
        iaResponse = validation.finalObject;
      } else {
        console.log('✅ Validation réussie');
      }
    } else {
      // Si la validation échoue mais qu'un finalObject est fourni, l'utiliser quand même
      if (validation.finalObject) {
        console.log('⚠️ Validation échouée mais finalObject fourni, utilisation de la réponse corrigée');
        iaResponse = validation.finalObject;
      } else {
        console.warn('⚠️ Validation échouée:', validation.reason);
        // On continue quand même avec la réponse originale pour ne pas bloquer le processus
      }
    }

    console.log(`📋 Recommandations requises pour le résumé: ${chatBotService['recommendationRequiredForSummary'](context)}`);

    return {
      updatedContext,
      iaResponse
    };
  }
  
  /**
   * Traiter la génération d'une réponse IA
   */
  private async processGenerateResponse(req: IAAuthenticatedRequest, taskData: IATaskRequest, context: HowanaContext): Promise<{ updatedContext: HowanaContext; iaResponse: any }> {
    if (!taskData.userMessage) {
      throw new Error('Message utilisateur manquant pour la génération de réponse');
    }

    console.log(`🤖 Génération d'une réponse IA pour: ${taskData.conversationId}`);
    
    // Obtenir le service de chatbot approprié
    const chatBotService = this.getChatBotService(context);
    
    // Calculer l'intent avant de générer la réponse
    console.log('🎯 Calcul de l\'intent avant génération de la réponse...');
    const intentResult = await chatBotService.computeIntent(context, taskData.userMessage);
    const intent = intentResult.intent;
    const intentCost = intentResult.intentCost;
    const globalIntentInfos = intentResult.globalIntentInfos;
    
    // Mettre à jour le contexte avec l'intent
    let contextWithIntent = { ...context };
    let lastUpdatedContext = contextWithIntent;
    
    // Mettre les nouvelles valeurs dans currentIntentInfos
    const currentIntentInfos = {
      intent: intent || null,
      intentCost: intentCost || null,
      intentContextText: null
    };
    
    contextWithIntent.metadata = {
      ...contextWithIntent.metadata,
      ['currentIntentInfos']: currentIntentInfos,
      ['globalIntentInfos']: globalIntentInfos,
      ['intentResults']: null
    };
    
    if (intent) {
      console.log('✅ Intent calculé avec succès et ajouté au contexte');
    } else {
      console.warn('⚠️ Calcul d\'intent retourné null, génération de la réponse sans intent');
    }
    
    // Créer le callback pour traiter chaque réponse générée par handleIntent
    let responseCount = 0;
    let lastIaResponse: any = null;
    const onIaResponse = async (iaResponse: any): Promise<void> => {
      responseCount++;
      console.log(`📨 handleIntent a généré une réponse #${responseCount}, traitement...`);
      
      // Utiliser la réponse de handleIntent
      const updatedContext = iaResponse.updatedContext || lastUpdatedContext;
      
      // Mettre à jour le contexte avec le nouveau messageId pour les futures réponses
      updatedContext.previousCallId = iaResponse.messageId;
      updatedContext.previousResponse = iaResponse.response;
      
      // Récupérer les extractedData depuis la réponse IA
      const extractedData = iaResponse.extractedData;
      
      // Construire les recommandations à partir des extractedData
      const recommendations = extractedData ? {
        activities: extractedData.activities || [],
        practices: extractedData.practices || []
      } : (lastUpdatedContext.recommendations || { activities: [], practices: [] });

      // Créer l'objet de réponse IA complet
      const completeIaResponse = {
        ...iaResponse,
        messageId: iaResponse.messageId,
        recommendations: recommendations,
        hasRecommendations: (recommendations.activities.length > 0 || recommendations.practices.length > 0)
      };

      console.log(`📋 Recommandations extraites: ${recommendations.activities.length} activités, ${recommendations.practices.length} pratiques`);

      // Vérifier si handleIntent indique qu'il y a une réponse suivante
      const hasNextResponse = iaResponse.haveNext === true;
      
      if (hasNextResponse) {
        // C'est une réponse intermédiaire, finaliser immédiatement
        const isFirstResponse = responseCount === 1;
        await this.finalizeIntermediateResponse(
          req,
          taskData,
          completeIaResponse,
          updatedContext,
          chatBotService,
          isFirstResponse
        );
        // Mettre à jour lastUpdatedContext avec le contexte modifié (qui contient lastIntermediateAiResponseId)
        lastUpdatedContext = updatedContext;
      } else {
        // C'est la dernière réponse, on la sauvegarde pour la retourner
        lastIaResponse = completeIaResponse;
      }

      // Mettre à jour le contexte local pour les prochaines réponses
      lastUpdatedContext = updatedContext;
    };

    // Appeler handleIntent avec le callback et attendre qu'il se termine
    // intent et globalIntentInfos sont maintenant récupérés depuis le contexte
    // handleIntent retourne le contexte mis à jour avec le globalIntentInfos calculé
    const updatedContext = await chatBotService['handleIntent'](contextWithIntent, taskData.userMessage, onIaResponse);
    contextWithIntent = updatedContext;
    
    // handleIntent a déjà généré et traité les réponses via le callback
    // Si c'était la dernière réponse (sans have_next), on la retourne et on laisse finalizeTask s'en occuper
    if (lastIaResponse) {
      return {
        updatedContext: contextWithIntent,
        iaResponse: lastIaResponse
      };
    }
    
    // Si aucune réponse n'a été générée (cas théorique), retourner un objet vide
    return {
      updatedContext: contextWithIntent,
      iaResponse: {}
    };
  }

  /**
   * Traiter la génération d'un résumé IA
   */
  private async processGenerateSummary(_req: IAAuthenticatedRequest, taskData: IATaskRequest, context: HowanaContext): Promise<{ updatedContext: HowanaContext; iaResponse: any }> {
    console.log(`📝 Génération d'un résumé IA pour: ${taskData.conversationId}`);
    
    // Obtenir le service de chatbot approprié
    const chatBotService = this.getChatBotService(context);
    
    const summary = await chatBotService.generateConversationSummary(context);
    
    // Récupérer les extractedData depuis la réponse du résumé si disponible
    const extractedData = summary.extractedData;
    
    // Construire les recommandations à partir des extractedData
    const recommendations = extractedData ? {
      activities: extractedData.activities || [],
      practices: extractedData.practices || []
    } : (context.recommendations || { activities: [], practices: [] });

    // Créer l'objet de réponse IA pour le résumé
    const iaResponse = {
      response: { summary: summary.summary },
      target_table: context.type === 'bilan' ? 'bilans' : context.type === 'activity' ? 'activities' : 'ai_responses',
      target_id: context.bilanId || context.activityId || null,
      summary_type: 'conversation_summary',
      recommendations: recommendations,
      hasRecommendations: (recommendations.activities.length > 0 || recommendations.practices.length > 0),
      messageId: `summary_${Date.now()}`,
      type: 'summary',
      cost_input: summary.cost_input ?? null,
      cost_cached_input: summary.cost_cached_input ?? null,
      cost_output: summary.cost_output ?? null,
    };

    return {
      updatedContext: context,
      iaResponse
    };
  }

  /**
   * Traiter la génération d'un échange non fini
   */
  private async processGenerateUnfinishedExchange(_req: IAAuthenticatedRequest, taskData: IATaskRequest, context: HowanaContext): Promise<{ updatedContext: HowanaContext; iaResponse: any }> {
    console.log(`🔄 Génération d'un échange non fini pour: ${taskData.conversationId}`);
    
    // Créer un message simple indiquant que l'utilisateur est parti
    const lastAnswer = taskData.lastAnswer || 'L\'utilisateur a quitté la conversation';
    const unfinishedMessage = `L'utilisateur est parti voir d'autre chose, mais voici sa dernière action : "${lastAnswer}". Cette conversation a été interrompue et peut être reprise plus tard.`;
    
    // Créer l'objet de réponse IA
    const iaResponse = {
      response: unfinishedMessage,
      messageId: `unfinished_${Date.now()}`,
      type: 'unfinished_exchange',
      lastUserAction: lastAnswer,
      timestamp: new Date().toISOString(),
      conversationInterrupted: true
    };

    return {
      updatedContext: context,
      iaResponse
    };
  }

  /**
   * Endpoint de santé pour Google Cloud Tasks
   */
  healthCheck(_req: Request, res: Response): void {
    res.status(200).json({
      status: 'healthy',
      service: 'ia-processing',
      timestamp: new Date().toISOString(),
      message: 'Service de traitement IA opérationnel'
    });
  }

  /**
   * Fermer les connexions
   */
  async disconnect(): Promise<void> {
    // Fermer les connexions aux services si nécessaire
    console.log('🔌 Connexions fermées pour IAController');
  }
}
