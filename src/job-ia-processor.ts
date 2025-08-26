import { ChatBotService } from './services/ChatBotService';
import { ConversationService } from './services/ConversationService';
import { SupabaseService } from './services/SupabaseService';
import { IAQueueService } from './services/IAQueueService';
import { ConversationContext } from './types/conversation';

interface IAProcessingJob {
  id: string;
  type: 'generate_response' | 'generate_summary' | 'generate_first_response';
  conversationId: string;
  userId: string;
  userMessage?: string;
  context: ConversationContext;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  retryCount: number;
  maxRetries: number;
}

/**
 * Worker individuel pour traiter les jobs IA
 */
class Worker {
  private id: number;
  private isBusy: boolean = false;
  private currentJob: IAProcessingJob | null = null;
  private chatBotService: ChatBotService;
  private conversationService: ConversationService;
  private supabaseService: SupabaseService;

  constructor(id: number) {
    this.id = id;
    this.chatBotService = new ChatBotService();
    this.conversationService = new ConversationService();
    this.supabaseService = new SupabaseService();
  }

  async processJob(job: IAProcessingJob): Promise<any> {
    if (this.isBusy) {
      throw new Error(`Worker ${this.id} est déjà occupé`);
    }

    this.isBusy = true;
    this.currentJob = job;

    try {
      console.log(`🔧 Worker ${this.id} traite le job: ${job.id} (${job.type})`);
      
      let result: any;
      switch (job.type) {
        case 'generate_response':
          result = await this.processGenerateResponse(job);
          break;
        case 'generate_summary':
          result = await this.processGenerateSummary(job);
          break;
        case 'generate_first_response':
          result = await this.processGenerateFirstResponse(job);
          break;
        default:
          throw new Error(`Type de job non supporté: ${job.type}`);
      }

      console.log(`✅ Worker ${this.id} a terminé le job: ${job.id}`);
      return result;

    } catch (error) {
      console.error(`❌ Worker ${this.id} a échoué sur le job ${job.id}:`, error);
      throw error;
    } finally {
      this.isBusy = false;
      this.currentJob = null;
    }
  }

  private async processGenerateResponse(job: IAProcessingJob): Promise<any> {
    if (!job.userMessage) {
      throw new Error('Message utilisateur manquant pour la génération de réponse');
    }

    console.log(`🤖 Worker ${this.id} génère une réponse IA pour: ${job.conversationId}`);
    
    // Générer la réponse IA
    const aiResponse = await this.chatBotService['generateAIResponse'](job.context, job.userMessage);
    
    // Ajouter la réponse à la conversation
    await this.conversationService.addMessage(job.conversationId, {
      content: aiResponse,
      type: 'bot',
      metadata: { source: 'ai', model: this.chatBotService.getAIModel() }
    });

    // Enregistrer dans Supabase
    await this.supabaseService.createAIResponse({
      conversation_id: job.conversationId,
      user_id: job.userId,
      response_text: aiResponse,
      message_type: 'text'
    });

    return {
      success: true,
      response: aiResponse,
      messageId: `msg_${Date.now()}`,
      workerId: this.id
    };
  }

  private async processGenerateSummary(job: IAProcessingJob): Promise<any> {
    console.log(`📝 Worker ${this.id} génère un résumé pour: ${job.conversationId}`);
    
    const summary = await this.chatBotService['generateConversationSummary'](job.context);
    
    // Sauvegarder le résumé dans la table appropriée selon le contexte
    try {
      if (job.context.type === 'bilan') {
        // Extraire l'ID du bilan depuis les métadonnées
        const bilanId = job.context.metadata?.['bilanId'] || job.context.metadata?.['bilan_id'];
        if (bilanId) {
          await this.supabaseService.updateBilanAISummary(bilanId, summary);
          console.log(`✅ Résumé IA sauvegardé dans le bilan: ${bilanId}`);
        } else {
          console.warn(`⚠️ ID du bilan non trouvé dans les métadonnées pour la conversation: ${job.conversationId}`);
        }
      } else if (job.context.type === 'activity') {
        // Extraire l'ID de l'activité depuis les métadonnées
        const activityId = job.context.metadata?.['activityId'] || job.context.metadata?.['activity_id'];
        if (activityId) {
          await this.supabaseService.updateActivityAISummary(activityId, summary);
          console.log(`✅ Résumé IA sauvegardé dans l'activité: ${activityId}`);
        } else {
          console.warn(`⚠️ ID de l'activité non trouvé dans les métadonnées pour la conversation: ${job.conversationId}`);
        }
      }
    } catch (error) {
      console.error(`❌ Erreur lors de la sauvegarde du résumé IA:`, error);
      // Continuer malgré l'erreur de sauvegarde
    }
    
    // TOUJOURS créer une aiResponse pour notifier le frontend
    try {
      // Créer un objet avec le résumé et les métadonnées
      const responseData = {
        summary: summary,
        target_table: job.context.type === 'bilan' ? 'bilans' : job.context.type === 'activity' ? 'activities' : 'ai_responses',
        target_id: job.context.metadata?.['bilanId'] || job.context.metadata?.['activityId'] || null,
        summary_type: 'conversation_summary'
      };

      await this.supabaseService.createAIResponse({
        conversation_id: job.conversationId,
        user_id: job.userId,
        response_text: JSON.stringify(responseData),
        message_type: 'summary'
      });
      console.log(`✅ aiResponse créée pour notifier le frontend du résumé disponible`);
    } catch (error) {
      console.error(`❌ Erreur lors de la création de l'aiResponse:`, error);
      // Cette erreur est critique car le frontend ne sera pas notifié
      throw error;
    }
    
    return {
      success: true,
      summary: summary,
      workerId: this.id
    };
  }

  private async processGenerateFirstResponse(job: IAProcessingJob): Promise<any> {
    console.log(`👋 Worker ${this.id} génère une première réponse pour: ${job.conversationId}`);
    
    const firstResponse = await this.chatBotService['generateFirstResponse'](job.context);
    
    // Ajouter la réponse à la conversation
    await this.conversationService.addMessage(job.conversationId, {
      content: firstResponse,
      type: 'bot',
      metadata: { source: 'ai', model: this.chatBotService.getAIModel(), type: 'first_response' }
    });

    // Enregistrer dans Supabase
    await this.supabaseService.createAIResponse({
      conversation_id: job.conversationId,
      user_id: job.userId,
      response_text: firstResponse,
      message_type: 'text'
    });

    return {
      success: true,
      response: firstResponse,
      messageId: `msg_${Date.now()}`,
      workerId: this.id
    };
  }

  isWorkerBusy(): boolean {
    return this.isBusy;
  }

  getCurrentJob(): IAProcessingJob | null {
    return this.currentJob;
  }

  async stop(): Promise<void> {
    if (this.currentJob) {
      console.log(`🛑 Worker ${this.id} arrêté en cours de traitement du job ${this.currentJob.id}`);
    }
    await this.conversationService.disconnect();
  }
}

export class IAResponseProcessor {
  private conversationService: ConversationService;
  private supabaseService: SupabaseService;
  private iaQueueService: IAQueueService;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private workerPool: Worker[] = [];
  private maxWorkers: number;
  private currentLoad: number = 0;
  private performanceMetrics = {
    totalJobsProcessed: 0,
    totalProcessingTime: 0,
    averageProcessingTime: 0,
    jobsPerSecond: 0,
    lastUpdateTime: Date.now()
  };

  constructor() {
    this.conversationService = new ConversationService();
    this.supabaseService = new SupabaseService();
    this.iaQueueService = new IAQueueService();
    
    // Configuration optimisée pour un coût minimal
    // 20 tasks × 10 workers = 200 requêtes simultanées max
    this.maxWorkers = parseInt(process.env['MAX_WORKERS'] || '10');
    this.initializeWorkerPool();
    
    console.log(`💰 Configuration optimisée pour coût minimal: ${this.maxWorkers} workers`);
  }

  /**
   * Initialiser le pool de workers pour le parallélisme
   */
  private initializeWorkerPool(): void {
    console.log(`🔧 Initialisation du pool de ${this.maxWorkers} workers...`);
    
    for (let i = 0; i < this.maxWorkers; i++) {
      this.workerPool.push(new Worker(i));
    }
    
    console.log(`✅ Pool de workers initialisé avec ${this.maxWorkers} workers`);
  }

  /**
   * Démarrer le processeur de jobs IA avec auto-scaling
   */
  async start(): Promise<void> {
    console.log('🚀 Démarrage du processeur de réponses IA avec auto-scaling...');
    
    // Vérifier la connexion aux services
    await this.checkConnections();
    
    // Démarrer le traitement en continu avec monitoring
    this.startProcessing();
    
    // Démarrer le monitoring de charge
    this.startLoadMonitoring();
    
    console.log('✅ Processeur de réponses IA démarré avec succès');
  }

  /**
   * Arrêter le processeur
   */
  async stop(): Promise<void> {
    console.log('🛑 Arrêt du processeur de réponses IA...');
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    this.isProcessing = false;
    
    // Arrêter tous les workers
    await Promise.all(this.workerPool.map(worker => worker.stop()));
    
    // Fermer les connexions
    await Promise.all([
      this.conversationService.disconnect(),
      this.iaQueueService.disconnect()
    ]);
    
    console.log('✅ Processeur de réponses IA arrêté');
  }

  /**
   * Vérifier les connexions aux services
   */
  private async checkConnections(): Promise<void> {
    try {
      // Test Supabase
      const supabaseTest = await this.supabaseService.testConnection();
      if (!supabaseTest.success) {
        throw new Error(`Connexion Supabase échouée: ${supabaseTest.error}`);
      }
      console.log('✅ Connexion Supabase OK');

      // Test Redis via IAQueueService
      const stats = await this.iaQueueService.getQueueStats();
      console.log('✅ Connexion Redis OK:', stats);

    } catch (error) {
      console.error('❌ Erreur lors de la vérification des connexions:', error);
      throw error;
    }
  }

  /**
   * Démarrer le traitement en continu avec auto-scaling
   */
  private startProcessing(): void {
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processJobsWithAutoScaling();
      }
    }, 1000); // Vérifier toutes les secondes pour une réactivité maximale
  }

  /**
   * Démarrer le monitoring de charge
   */
  private startLoadMonitoring(): void {
    setInterval(async () => {
      const stats = await this.iaQueueService.getQueueStats();
      this.currentLoad = stats.pending + stats.processing;
      
      // Log des métriques de performance
      console.log(`📊 Métriques de charge:`, {
        pending: stats.pending,
        processing: stats.processing,
        completed: stats.completed,
        failed: stats.failed,
        activeWorkers: this.workerPool.filter(w => w.isWorkerBusy()).length,
        totalWorkers: this.maxWorkers,
        loadPercentage: Math.round((this.currentLoad / (this.maxWorkers * 2)) * 100),
        jobsPerSecond: this.performanceMetrics.jobsPerSecond,
        averageProcessingTime: Math.round(this.performanceMetrics.averageProcessingTime)
      });

      // Auto-scaling basé sur la charge
      await this.autoScaleWorkers(stats.pending);
      
    }, 5000); // Mise à jour toutes les 5 secondes
  }

  /**
   * Traitement des jobs avec auto-scaling
   */
  private async processJobsWithAutoScaling(): Promise<void> {
    try {
      this.isProcessing = true;
      
      // Récupérer plusieurs jobs selon la capacité des workers
      const availableWorkers = this.workerPool.filter(w => !w.isWorkerBusy());
      const jobsToProcess = Math.min(availableWorkers.length, 10); // Traiter jusqu'à 10 jobs simultanément
      
      if (jobsToProcess === 0) {
        return; // Aucun worker disponible
      }

      const jobs: IAProcessingJob[] = [];
      for (let i = 0; i < jobsToProcess; i++) {
        const job = await this.iaQueueService.getNextJob();
        if (job) {
          jobs.push(job);
        }
      }

      if (jobs.length === 0) {
        return; // Aucun job à traiter
      }

      console.log(`🔍 Traitement de ${jobs.length} jobs IA avec ${availableWorkers.length} workers disponibles`);

      // Traiter les jobs en parallèle
      const processingPromises = jobs.map(async (job, index) => {
        const worker = availableWorkers[index];
        if (!worker) return;

        const startTime = Date.now();
        try {
          const result = await worker.processJob(job);
          
          // Marquer le job comme terminé
          await this.iaQueueService.markJobAsCompleted(job.id, result);
          
          // Mettre à jour les métriques
          const processingTime = Date.now() - startTime;
          this.updatePerformanceMetrics(processingTime);
          
          console.log(`✅ Job IA traité avec succès: ${job.id} par worker ${worker['id']} en ${processingTime}ms`);

        } catch (error) {
          console.error(`❌ Erreur lors du traitement du job ${job.id}:`, error);
          
          // Marquer le job comme échoué
          await this.iaQueueService.markJobAsFailed(job.id, (error as Error).message);
        }
      });

      // Attendre que tous les jobs soient traités
      await Promise.allSettled(processingPromises);

    } catch (error) {
      console.error('❌ Erreur lors du traitement des jobs IA:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Auto-scaling des workers basé sur la charge (désactivé pour optimiser les coûts)
   */
  private async autoScaleWorkers(pendingJobs: number): Promise<void> {
    // Auto-scaling désactivé pour optimiser les coûts
    // Configuration fixe: 20 tasks × 10 workers = 200 requêtes simultanées max
    const currentWorkers = this.maxWorkers;
    const activeWorkers = this.workerPool.filter(w => w.isWorkerBusy()).length;
    
    // Log de la charge actuelle
    console.log(`📊 Charge actuelle: ${pendingJobs} jobs en attente, ${activeWorkers}/${currentWorkers} workers actifs`);
    
    // Pas d'auto-scaling pour maintenir un coût prévisible
    if (pendingJobs > currentWorkers * 2) {
      console.log(`⚠️ Charge élevée détectée (${pendingJobs} jobs), mais auto-scaling désactivé pour optimiser les coûts`);
    }
  }

  /**
   * Mettre à jour les métriques de performance
   */
  private updatePerformanceMetrics(processingTime: number): void {
    this.performanceMetrics.totalJobsProcessed++;
    this.performanceMetrics.totalProcessingTime += processingTime;
    this.performanceMetrics.averageProcessingTime = 
      this.performanceMetrics.totalProcessingTime / this.performanceMetrics.totalJobsProcessed;
    
    // Calculer les jobs par seconde
    const now = Date.now();
    const timeDiff = (now - this.performanceMetrics.lastUpdateTime) / 1000;
    if (timeDiff >= 1) {
      this.performanceMetrics.jobsPerSecond = 
        this.performanceMetrics.totalJobsProcessed / (timeDiff / 1000);
      this.performanceMetrics.lastUpdateTime = now;
    }
  }

  /**
   * Obtenir les statistiques de performance
   */
  async getPerformanceStats(): Promise<any> {
    const queueStats = await this.iaQueueService.getQueueStats();
    
    return {
      workers: {
        total: this.maxWorkers,
        active: this.workerPool.filter(w => w.isWorkerBusy()).length,
        idle: this.workerPool.filter(w => !w.isWorkerBusy()).length
      },
      queue: queueStats,
      performance: this.performanceMetrics,
      load: {
        current: this.currentLoad,
        percentage: Math.round((this.currentLoad / (this.maxWorkers * 2)) * 100)
      }
    };
  }

  /**
   * Traiter un job spécifique (pour les tests)
   */
  async processSpecificJob(job: IAProcessingJob): Promise<any> {
    try {
      console.log(`🔍 Traitement du job spécifique: ${job.id}`);
      
      // Trouver un worker disponible
      const availableWorker = this.workerPool.find(w => !w.isWorkerBusy());
      if (!availableWorker) {
        throw new Error('Aucun worker disponible');
      }
      
      const startTime = Date.now();
      const result = await availableWorker.processJob(job);
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Job spécifique traité en ${processingTime}ms`);
      return result;

    } catch (error) {
      console.error('❌ Erreur lors du traitement du job spécifique:', error);
      throw error;
    }
  }
}

// Point d'entrée pour le job
async function main() {
  const processor = new IAResponseProcessor();
  
  try {
    await processor.start();
    
    // Garder le processus en vie
    process.on('SIGINT', async () => {
      console.log('\n🛑 Signal SIGINT reçu, arrêt en cours...');
      await processor.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Signal SIGTERM reçu, arrêt en cours...');
      await processor.stop();
      process.exit(0);
    });

    // Log des statistiques toutes les minutes
    setInterval(async () => {
      try {
        const stats = await processor.getPerformanceStats();
        console.log('📈 Statistiques de performance:', stats);
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des statistiques:', error);
      }
    }, 60000);

  } catch (error) {
    console.error('❌ Erreur fatale dans le processeur IA:', error);
    process.exit(1);
  }
}

// Démarrer si le fichier est exécuté directement
if (require.main === module) {
  main();
}
