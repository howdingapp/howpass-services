import { IAQueueService } from './IAQueueService';
import { ConversationService } from './ConversationService';

export interface IAJobRequest {
  type: 'generate_response' | 'generate_summary' | 'generate_first_response';
  conversationId: string;
  userId: string;
  userMessage?: string;
  priority?: 'low' | 'medium' | 'high';
}

export class IAJobTriggerService {
  private iaQueueService: IAQueueService;
  private conversationService: ConversationService;

  constructor() {
    this.iaQueueService = new IAQueueService();
    this.conversationService = new ConversationService();
  }

  /**
   * Déclencher un job IA et le mettre en queue
   */
  async triggerIAJob(request: IAJobRequest): Promise<{
    success: boolean;
    jobId: string;
    estimatedTime: string;
    queuePosition?: number | undefined;
  }> {
    try {
      console.log(`🚀 Déclenchement d'un job IA: ${request.type} pour la conversation ${request.conversationId}`);

      // Récupérer le contexte de la conversation
      const context = await this.conversationService.getContext(request.conversationId);
      if (!context) {
        throw new Error(`Conversation ${request.conversationId} non trouvée`);
      }

      // Déterminer la priorité
      const priority = this.determinePriority(request.priority, request.type);

      // Créer le job
      const jobId = await this.iaQueueService.addJob({
        type: request.type,
        conversationId: request.conversationId,
        userId: request.userId,
        userMessage: request.userMessage || '',
        context,
        priority,
        retryCount: 0,
        maxRetries: parseInt(process.env['MAX_JOB_RETRIES'] || '3')
      });

      // Obtenir les statistiques de la queue
      const stats = await this.iaQueueService.getQueueStats();
      const estimatedTime = this.calculateEstimatedTime(stats.pending, priority);

      console.log(`✅ Job IA créé: ${jobId} (${request.type}) - Priorité: ${priority} - Temps estimé: ${estimatedTime}`);

      return {
        success: true,
        jobId,
        estimatedTime,
        queuePosition: stats.pending
      };

    } catch (error) {
      console.error('❌ Erreur lors du déclenchement du job IA:', error);
      throw error;
    }
  }

  /**
   * Déclencher plusieurs jobs IA en parallèle
   */
  async triggerMultipleIAJobs(requests: IAJobRequest[]): Promise<{
    success: boolean;
    results: Array<{
      jobId: string;
      estimatedTime: string;
      queuePosition?: number | undefined;
    }>;
    totalJobs: number;
  }> {
    try {
      console.log(`🚀 Déclenchement de ${requests.length} jobs IA en parallèle`);

      const results = await Promise.all(
        requests.map(request => this.triggerIAJob(request))
      );

      const successfulJobs = results.filter(result => result.success);
      const totalJobs = successfulJobs.length;

      console.log(`✅ ${totalJobs}/${requests.length} jobs IA créés avec succès`);

      return {
        success: true,
        results: successfulJobs.map(result => ({
          jobId: result.jobId,
          estimatedTime: result.estimatedTime,
          queuePosition: result.queuePosition
        })),
        totalJobs
      };

    } catch (error) {
      console.error('❌ Erreur lors du déclenchement de plusieurs jobs IA:', error);
      throw error;
    }
  }

  /**
   * Vérifier le statut d'un job IA
   */
  async getJobStatus(_jobId: string): Promise<{
    success: boolean;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;
    estimatedCompletion?: string;
    result?: any;
    error?: string;
  }> {
    try {
      // Cette méthode devra être implémentée dans IAQueueService
      // Pour l'instant, on retourne un statut basique
      return {
        success: true,
        status: 'pending',
        progress: 0,
        estimatedCompletion: 'calculating...'
      };
    } catch (error) {
      console.error('❌ Erreur lors de la vérification du statut du job:', error);
      throw error;
    }
  }

  /**
   * Obtenir les statistiques de la queue
   */
  async getQueueStats(): Promise<{
    success: boolean;
    stats: {
      pending: number;
      processing: number;
      completed: number;
      failed: number;
      estimatedWaitTime: string;
    };
  }> {
    try {
      const stats = await this.iaQueueService.getQueueStats();
      const estimatedWaitTime = this.calculateEstimatedTime(stats.pending, 'medium');

      return {
        success: true,
        stats: {
          ...stats,
          estimatedWaitTime
        }
      };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des statistiques de la queue:', error);
      throw error;
    }
  }

  /**
   * Nettoyer les anciens jobs terminés
   */
  async cleanupOldJobs(maxAgeHours: number = 24): Promise<{
    success: boolean;
    cleanedJobs: number;
  }> {
    try {
      await this.iaQueueService.cleanupOldJobs(maxAgeHours);
      
      return {
        success: true,
        cleanedJobs: 0 // Le nombre exact sera calculé par IAQueueService
      };
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage des anciens jobs:', error);
      throw error;
    }
  }

  /**
   * Déterminer la priorité d'un job
   */
  private determinePriority(userPriority?: 'low' | 'medium' | 'high', jobType?: string): 'low' | 'medium' | 'high' {
    if (userPriority) {
      return userPriority;
    }

    // Priorité par défaut basée sur le type de job
    switch (jobType) {
      case 'generate_response':
        return 'medium';
      case 'generate_first_response':
        return 'high';
      case 'generate_summary':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Calculer le temps estimé de traitement
   */
  private calculateEstimatedTime(pendingJobs: number, priority: 'low' | 'medium' | 'high'): string {
    const baseTimePerJob = 2; // 2 secondes par job en moyenne
    const priorityMultiplier = {
      high: 0.5,    // Priorité haute = 2x plus rapide
      medium: 1,    // Priorité normale
      low: 2        // Priorité basse = 2x plus lent
    };

    const estimatedSeconds = Math.ceil(pendingJobs * baseTimePerJob * priorityMultiplier[priority]);
    
    if (estimatedSeconds < 60) {
      return `${estimatedSeconds} secondes`;
    } else if (estimatedSeconds < 3600) {
      const minutes = Math.ceil(estimatedSeconds / 60);
      return `${minutes} minutes`;
    } else {
      const hours = Math.ceil(estimatedSeconds / 3600);
      return `${hours} heures`;
    }
  }

  /**
   * Fermer les connexions
   */
  async disconnect(): Promise<void> {
    await Promise.all([
      this.iaQueueService.disconnect(),
      this.conversationService.disconnect()
    ]);
  }
}
