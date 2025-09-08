import { GoogleCloudTasksService } from './GoogleCloudTasksService';

export interface IAJobRequest {
  type: 'generate_response' | 'generate_summary' | 'generate_first_response' | 'generate_unfinished_exchange';
  conversationId: string;
  userMessage?: string;
  priority?: 'low' | 'medium' | 'high';
  authToken?: string; // Token d'authentification pour sécuriser les tâches
  aiResponseId?: string | undefined; // ID de l'entrée ai_response pré-créée
  lastAnswer?: string; // Dernière réponse de l'utilisateur pour les échanges non finis
}

export class IAJobTriggerService {
  private googleCloudTasksService: GoogleCloudTasksService;

  constructor() {
    this.googleCloudTasksService = new GoogleCloudTasksService();
  }

  /**
   * Déclencher un job IA via Google Cloud Tasks
   */
  async triggerIAJob(request: IAJobRequest, authToken: string): Promise<{
    success: boolean;
    jobId: string;
    estimatedTime: string;
  }> {
    try {
      console.log(`🚀 Déclenchement d'un job IA: ${request.type} pour la conversation ${request.conversationId}`);

      // Déterminer la priorité
      const priority = this.determinePriority(request.priority, request.type);

      // ✅ Créer directement une tâche Google Cloud Tasks
      const task = await this.createGoogleCloudTask(request, authToken);

      // Calculer le temps estimé basé sur la priorité
      const estimatedTime = this.calculateEstimatedTime(priority);

      console.log(`✅ Tâche IA créée: ${task.name} (${request.type}) - Priorité: ${priority} - Temps estimé: ${estimatedTime}`);

      return {
        success: true,
        jobId: task.name || `task_${Date.now()}`,
        estimatedTime
      };

    } catch (error) {
      console.error('❌ Erreur lors du déclenchement du job IA:', error);
      throw error;
    }
  }

  /**
   * Créer une tâche Google Cloud Tasks pour le traitement IA
   */
  private async createGoogleCloudTask(request: IAJobRequest, authToken: string): Promise<any> {
    try {
      console.log(`🚀 Création de la tâche Google Cloud Tasks pour: ${request.type}`);

      // S'assurer que la priorité est définie
      const priority = request.priority || 'medium';

      // Créer la tâche avec priorité et token d'authentification
      const taskData: Parameters<typeof this.googleCloudTasksService.createPriorityIATask>[0] = {
        type: request.type,
        conversationId: request.conversationId,
        priority: priority,
        authToken: authToken // Ajouter le token d'authentification
      };
      
      // Ajouter userMessage seulement s'il est défini
      if (request.userMessage) {
        taskData.userMessage = request.userMessage;
      }
      
      // Ajouter aiResponseId seulement s'il est défini
      if (request.aiResponseId) {
        taskData.aiResponseId = request.aiResponseId;
      }
      
      const task = await this.googleCloudTasksService.createPriorityIATask(taskData);

      console.log(`✅ Tâche Google Cloud Tasks créée avec succès: ${task.name}`);
      console.log(`📋 Queue: ${this.getPriorityQueueName(priority)}`);
      console.log(`⏱️ Délai max: ${this.getPriorityDeadline(priority)}s`);

      return task;

    } catch (error) {
      console.error('❌ Erreur lors de la création de la tâche Google Cloud Tasks:', error);
      
      // Fallback : log des informations de debug
      console.log(`💡 Fallback - Informations de debug:`, {
        type: request.type,
        conversationId: request.conversationId,
        priority: request.priority || 'medium',
        gcpProjectId: process.env['GCP_PROJECT_ID'],
        gcpLocation: process.env['GCP_LOCATION'],
        queueName: process.env['GCP_TASKS_QUEUE_NAME'] || 'ia-processing-queue'
      });
      
      throw error;
    }
  }

  /**
   * Obtenir le nom de la queue basé sur la priorité
   */
  private getPriorityQueueName(priority: 'low' | 'medium' | 'high'): string {
    switch (priority) {
      case 'high':
        return 'ia-processing-high-priority';
      case 'medium':
        return 'ia-processing-medium-priority';
      case 'low':
        return 'ia-processing-low-priority';
      default:
        return 'ia-processing-queue';
    }
  }

  /**
   * Obtenir le délai de dispatch basé sur la priorité
   */
  private getPriorityDeadline(priority: 'low' | 'medium' | 'high'): number {
    switch (priority) {
      case 'high':
        return 60; // 1 minute max
      case 'medium':
        return 300; // 5 minutes max
      case 'low':
        return 900; // 15 minutes max
      default:
        return 300;
    }
  }

  /**
   * Déclencher plusieurs jobs IA en parallèle
   */
  async triggerMultipleIAJobs(requests: IAJobRequest[], authToken: string): Promise<{
    success: boolean;
    results: Array<{
      jobId: string;
      estimatedTime: string;
    }>;
    totalJobs: number;
  }> {
    try {
      console.log(`🚀 Déclenchement de ${requests.length} jobs IA en parallèle`);

      const results = await Promise.all(
        requests.map(request => this.triggerIAJob(request, authToken))
      );

      const successfulJobs = results.filter(result => result.success);
      const totalJobs = successfulJobs.length;

      console.log(`✅ ${totalJobs}/${requests.length} jobs IA créés avec succès`);

      return {
        success: true,
        results: successfulJobs.map(result => ({
          jobId: result.jobId,
          estimatedTime: result.estimatedTime
        })),
        totalJobs
      };

    } catch (error) {
      console.error('❌ Erreur lors du déclenchement de plusieurs jobs IA:', error);
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
  private calculateEstimatedTime(priority: 'low' | 'medium' | 'high'): string {
    const baseTimePerJob = 2; // 2 secondes par job en moyenne
    const priorityMultiplier = {
      high: 0.5,    // Priorité haute = 2x plus rapide
      medium: 1,    // Priorité normale
      low: 2        // Priorité basse = 2x plus lent
    };

    const estimatedSeconds = Math.ceil(baseTimePerJob * priorityMultiplier[priority]);
    
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
    await this.googleCloudTasksService.close();
  }
}
