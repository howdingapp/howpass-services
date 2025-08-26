import Redis from 'ioredis';
import { ConversationContext } from '../types/conversation';

export interface IAProcessingJob {
  id: string;
  type: 'generate_response' | 'generate_summary' | 'generate_first_response';
  conversationId: string;
  userId: string;
  userMessage?: string;
  context: ConversationContext;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  maxRetries: number;
  result?: any;
  error?: string;
}

export class IAQueueService {
  private redis: Redis;
  private readonly QUEUE_KEY = 'ia_processing_queue';
  private readonly PROCESSING_KEY = 'ia_processing_jobs';
  private readonly COMPLETED_KEY = 'ia_completed_jobs';
  private readonly FAILED_KEY = 'ia_failed_jobs';

  constructor() {
    this.redis = new Redis({
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379'),
      ...(process.env['REDIS_PASSWORD'] && { password: process.env['REDIS_PASSWORD'] }),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    this.redis.on('error', (error: Error) => {
      console.error('❌ Erreur Redis IAQueueService:', error);
    });

    this.redis.on('connect', () => {
      console.log('✅ IAQueueService connecté à Redis');
    });
  }

  /**
   * Ajouter un job à la queue
   */
  async addJob(job: Omit<IAProcessingJob, 'id' | 'createdAt' | 'status'>): Promise<string> {
    const jobId = `ia_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullJob: IAProcessingJob = {
      ...job,
      id: jobId,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    // Ajouter à la queue avec priorité
    const priorityScore = this.getPriorityScore(job.priority);
    await this.redis.zadd(this.QUEUE_KEY, priorityScore, JSON.stringify(fullJob));

    console.log(`📥 Job IA ajouté à la queue: ${jobId} (${job.type}) - Priorité: ${job.priority}`);
    return jobId;
  }

  /**
   * Récupérer le prochain job à traiter
   */
  async getNextJob(): Promise<IAProcessingJob | null> {
    try {
      // Récupérer le job avec la priorité la plus élevée
      const jobs = await this.redis.zrevrange(this.QUEUE_KEY, 0, 0, 'WITHSCORES');
      
      if (jobs.length === 0) {
        return null;
      }

      const jobData = jobs[0];
      if (!jobData) return null;
      
      const job: IAProcessingJob = JSON.parse(jobData);

      // Vérifier que le job n'est pas déjà en cours de traitement
      const isProcessing = await this.redis.hexists(this.PROCESSING_KEY, job.id);
      if (isProcessing) {
        return null;
      }

      // Marquer le job comme en cours de traitement
      await this.redis.hset(this.PROCESSING_KEY, job.id, JSON.stringify({
        ...job,
        status: 'processing',
        startedAt: new Date().toISOString()
      }));

      // Retirer le job de la queue
      await this.redis.zrem(this.QUEUE_KEY, jobData);

      console.log(`🔍 Job IA récupéré pour traitement: ${job.id} (${job.type})`);
      return job;

    } catch (error) {
      console.error('❌ Erreur lors de la récupération du job:', error);
      return null;
    }
  }

  /**
   * Marquer un job comme terminé
   */
  async markJobAsCompleted(jobId: string, result: any): Promise<void> {
    try {
      // Récupérer le job depuis la liste des jobs en cours
      const jobData = await this.redis.hget(this.PROCESSING_KEY, jobId);
      if (!jobData) {
        console.warn(`⚠️ Job ${jobId} non trouvé dans la liste des jobs en cours`);
        return;
      }

      const job: IAProcessingJob = JSON.parse(jobData);
      const completedJob = {
        ...job,
        status: 'completed',
        completedAt: new Date().toISOString(),
        result
      };

      // Ajouter à la liste des jobs terminés
      await this.redis.hset(this.COMPLETED_KEY, jobId, JSON.stringify(completedJob));
      
      // Retirer de la liste des jobs en cours
      await this.redis.hdel(this.PROCESSING_KEY, jobId);

      console.log(`✅ Job IA marqué comme terminé: ${jobId}`);

    } catch (error) {
      console.error('❌ Erreur lors de la finalisation du job:', error);
    }
  }

  /**
   * Marquer un job comme échoué
   */
  async markJobAsFailed(jobId: string, error: string): Promise<void> {
    try {
      // Récupérer le job depuis la liste des jobs en cours
      const jobData = await this.redis.hget(this.PROCESSING_KEY, jobId);
      if (!jobData) {
        console.warn(`⚠️ Job ${jobId} non trouvé dans la liste des jobs en cours`);
        return;
      }

      const job: IAProcessingJob = JSON.parse(jobData);
      
      if (job.retryCount < job.maxRetries) {
        // Réessayer le job
        const retryJob = {
          ...job,
          retryCount: job.retryCount + 1,
          status: 'pending',
          lastError: error,
          lastRetryAt: new Date().toISOString()
        };

        // Remettre dans la queue avec une priorité plus basse
        const priorityScore = this.getPriorityScore(job.priority) - (retryJob.retryCount * 10);
        await this.redis.zadd(this.QUEUE_KEY, priorityScore, JSON.stringify(retryJob));
        
        console.log(`🔄 Job IA remis en queue pour retry: ${jobId} (tentative ${retryJob.retryCount}/${job.maxRetries})`);
      } else {
        // Job définitivement échoué
        const failedJob = {
          ...job,
          status: 'failed',
          failedAt: new Date().toISOString(),
          finalError: error
        };

        // Ajouter à la liste des jobs échoués
        await this.redis.hset(this.FAILED_KEY, jobId, JSON.stringify(failedJob));
        
        console.log(`❌ Job IA marqué comme définitivement échoué: ${jobId}`);
      }

      // Retirer de la liste des jobs en cours
      await this.redis.hdel(this.PROCESSING_KEY, jobId);

    } catch (error) {
      console.error('❌ Erreur lors de la gestion de l\'échec du job:', error);
    }
  }

  /**
   * Obtenir les statistiques de la queue
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    try {
      const [pending, processing, completed, failed] = await Promise.all([
        this.redis.zcard(this.QUEUE_KEY),
        this.redis.hlen(this.PROCESSING_KEY),
        this.redis.hlen(this.COMPLETED_KEY),
        this.redis.hlen(this.FAILED_KEY)
      ]);

      return { pending, processing, completed, failed };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des statistiques:', error);
      return { pending: 0, processing: 0, completed: 0, failed: 0 };
    }
  }

  /**
   * Nettoyer les anciens jobs terminés (gestion de la mémoire)
   */
  async cleanupOldJobs(maxAgeHours: number = 24): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
      
      // Nettoyer les jobs terminés
      const completedJobs = await this.redis.hgetall(this.COMPLETED_KEY);
      for (const [jobId, jobData] of Object.entries(completedJobs)) {
        const job: any = JSON.parse(jobData);
        if (job.completedAt && new Date(job.completedAt) < cutoffTime) {
          await this.redis.hdel(this.COMPLETED_KEY, jobId);
        }
      }

      // Nettoyer les jobs échoués
      const failedJobs = await this.redis.hgetall(this.FAILED_KEY);
      for (const [jobId, jobData] of Object.entries(failedJobs)) {
        const job: any = JSON.parse(jobData);
        if (job.failedAt && new Date(job.failedAt) < cutoffTime) {
          await this.redis.hdel(this.FAILED_KEY, jobId);
        }
      }

      console.log(`🧹 Nettoyage des anciens jobs IA terminé (plus de ${maxAgeHours}h)`);
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage des anciens jobs:', error);
    }
  }

  /**
   * Obtenir le score de priorité pour Redis
   */
  private getPriorityScore(priority: 'low' | 'medium' | 'high'): number {
    switch (priority) {
      case 'high': return 100;
      case 'medium': return 50;
      case 'low': return 10;
      default: return 25;
    }
  }

  /**
   * Fermer la connexion Redis
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
