import { CloudTasksClient } from '@google-cloud/tasks';
import type { protos } from '@google-cloud/tasks';

type CreateTaskRequest = protos.google.cloud.tasks.v2.ICreateTaskRequest;
type Task = protos.google.cloud.tasks.v2.ITask;

/**
 * Service pour gérer les Google Cloud Tasks
 */
export class GoogleCloudTasksService {
  private client: CloudTasksClient;
  private projectId: string;
  private location: string;
  private queueName: string;
  private queuePath: string;

  constructor() {
    this.client = new CloudTasksClient();
    this.projectId = process.env['GCP_PROJECT_ID'] || '';
    this.location = process.env['GCP_LOCATION'] || 'europe-west1';
    this.queueName = process.env['GCP_TASKS_QUEUE_NAME'] || 'ia-processing-queue';
    this.queuePath = this.client.queuePath(this.projectId, this.location, this.queueName);
  }

  /**
   * Créer une tâche pour le traitement IA
   */
  async createIATask(taskData: {
    type: 'generate_response' | 'generate_summary' | 'generate_first_response';
    conversationId: string;
    userId: string;
    userMessage?: string;
    priority: 'low' | 'medium' | 'high';
    authToken: string; // Token d'authentification pour sécuriser les tâches
  }): Promise<Task> {
    try {
      if (!this.projectId) {
        throw new Error('GCP_PROJECT_ID non défini');
      }

      // URL de destination (endpoint de traitement IA)
      const serviceUrl = process.env['IA_PROCESSING_SERVICE_URL'] || 
        `https://${process.env['GCP_PROJECT_ID']}-${this.location}.run.app/api/ia/process`;

      const task: CreateTaskRequest = {
        parent: this.queuePath,
        task: {
          httpRequest: {
            httpMethod: 'POST',
            url: serviceUrl,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Google-Cloud-Tasks'
            },
            body: Buffer.from(JSON.stringify(taskData)).toString('base64'),
            oidcToken: {
              serviceAccountEmail: process.env['GCP_SERVICE_ACCOUNT_EMAIL'] || 
                `${this.projectId}@appspot.gserviceaccount.com`,
              audience: serviceUrl
            }
          },
          // Configuration des retries
          dispatchDeadline: {
            seconds: 300 // 5 minutes max
          }
        }
      };

      console.log(`🚀 Création de la tâche IA: ${taskData.type} pour ${taskData.conversationId}`);
      
      const [response] = await this.client.createTask(task);
      
      console.log(`✅ Tâche IA créée avec succès: ${response.name}`);
      return response;

    } catch (error) {
      console.error('❌ Erreur lors de la création de la tâche IA:', error);
      throw error;
    }
  }

  /**
   * Créer une tâche avec délai (pour les tâches différées)
   */
  async createDelayedIATask(taskData: {
    type: 'generate_response' | 'generate_summary' | 'generate_first_response';
    conversationId: string;
    userId: string;
    userMessage?: string;
    priority: 'low' | 'medium' | 'high';
    authToken: string; // Token d'authentification pour sécuriser les tâches
  }, delaySeconds: number): Promise<Task> {
    try {
      if (!this.projectId) {
        throw new Error('GCP_PROJECT_ID non défini');
      }

      const serviceUrl = process.env['IA_PROCESSING_SERVICE_URL'] || 
        `https://${process.env['GCP_PROJECT_ID']}-${this.location}.run.app/api/ia/process`;

      const task: CreateTaskRequest = {
        parent: this.queuePath,
        task: {
          httpRequest: {
            httpMethod: 'POST',
            url: serviceUrl,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Google-Cloud-Tasks'
            },
            body: Buffer.from(JSON.stringify(taskData)).toString('base64'),
            oidcToken: {
              serviceAccountEmail: process.env['GCP_SERVICE_ACCOUNT_EMAIL'] || 
                `${this.projectId}@appspot.gserviceaccount.com`,
              audience: serviceUrl
            }
          },
          // Délai d'exécution
          scheduleTime: {
            seconds: Math.floor(Date.now() / 1000) + delaySeconds
          },
          dispatchDeadline: {
            seconds: 300 // 5 minutes max
          }
        }
      };

      console.log(`⏰ Création de la tâche IA différée (${delaySeconds}s): ${taskData.type} pour ${taskData.conversationId}`);
      
      const [response] = await this.client.createTask(task);
      
      console.log(`✅ Tâche IA différée créée avec succès: ${response.name}`);
      return response;

    } catch (error) {
      console.error('❌ Erreur lors de la création de la tâche IA différée:', error);
      throw error;
    }
  }

  /**
   * Créer une tâche avec priorité (utilise des queues séparées)
   */
  async createPriorityIATask(taskData: {
    type: 'generate_response' | 'generate_summary' | 'generate_first_response';
    conversationId: string;
    userId: string;
    userMessage?: string;
    priority: 'low' | 'medium' | 'high';
    authToken: string; // Token d'authentification pour sécuriser les tâches
  }): Promise<Task> {
    try {
      if (!this.projectId) {
        throw new Error('GCP_PROJECT_ID non défini');
      }

      // Queue basée sur la priorité
      const priorityQueueName = this.getPriorityQueueName(taskData.priority);
      const priorityQueuePath = this.client.queuePath(this.projectId, this.location, priorityQueueName);

      const serviceUrl = process.env['IA_PROCESSING_SERVICE_URL'] || 
        `https://${process.env['GCP_PROJECT_ID']}-${this.location}.run.app/api/ia/process`;

      const task: CreateTaskRequest = {
        parent: priorityQueuePath,
        task: {
          httpRequest: {
            httpMethod: 'POST',
            url: serviceUrl,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Google-Cloud-Tasks',
              'X-Task-Priority': taskData.priority,
              'X-Conversation-Id': taskData.conversationId
            },
            body: Buffer.from(JSON.stringify(taskData)).toString('base64'),
            oidcToken: {
              serviceAccountEmail: process.env['GCP_SERVICE_ACCOUNT_EMAIL'] || 
                `${this.projectId}@appspot.gserviceaccount.com`,
              audience: serviceUrl
            }
          },
          dispatchDeadline: {
            seconds: this.getPriorityDeadline(taskData.priority)
          }
        }
      };

      console.log('task', task);

      console.log(`🎯 Création de la tâche IA prioritaire (${taskData.priority}): ${taskData.type} pour ${taskData.conversationId}`);
      
      const [response] = await this.client.createTask(task);
      
      console.log(`✅ Tâche IA prioritaire créée avec succès: ${response.name}`);
      return response;

    } catch (error) {
      console.error('❌ Erreur lors de la création de la tâche IA prioritaire:', error);
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
        return this.queueName;
    }
  }

  /**
   * Obtenir le délai de dispatch basé sur la priorité
   */
  private getPriorityDeadline(priority: 'low' | 'medium' | 'high'): number {
    switch (priority) {
      case 'high':
        return 120; // 2 minutes max
      case 'medium':
        return 300; // 5 minutes max
      case 'low':
        return 900; // 15 minutes max
      default:
        return 300;
    }
  }

  /**
   * Lister les tâches en cours
   */
  async listTasks(queueName?: string): Promise<Task[]> {
    try {
      const queuePath = queueName ? 
        this.client.queuePath(this.projectId, this.location, queueName) : 
        this.queuePath;

      const [tasks] = await this.client.listTasks({ parent: queuePath });
      
      console.log(`📋 ${tasks.length} tâches trouvées dans la queue ${queueName || this.queueName}`);
      return tasks;

    } catch (error) {
      console.error('❌ Erreur lors de la liste des tâches:', error);
      return [];
    }
  }

  /**
   * Supprimer une tâche
   */
  async deleteTask(taskName: string): Promise<void> {
    try {
      await this.client.deleteTask({ name: taskName });
      console.log(`🗑️ Tâche supprimée: ${taskName}`);
    } catch (error) {
      console.error('❌ Erreur lors de la suppression de la tâche:', error);
      throw error;
    }
  }

  /**
   * Purger une queue (supprimer toutes les tâches)
   */
  async purgeQueue(queueName?: string): Promise<void> {
    try {
      const queuePath = queueName ? 
        this.client.queuePath(this.projectId, this.location, queueName) : 
        this.queuePath;

      await this.client.purgeQueue({ name: queuePath });
      console.log(`🧹 Queue purgée: ${queueName || this.queueName}`);
    } catch (error) {
      console.error('❌ Erreur lors de la purge de la queue:', error);
      throw error;
    }
  }

  /**
   * Fermer la connexion
   */
  async close(): Promise<void> {
    await this.client.close();
    console.log('🔌 Connexion Google Cloud Tasks fermée');
  }
}
