import { CloudTasksClient, protos } from '@google-cloud/tasks';

export interface TaskPayload {
  mergeRequest: any;
  table: string;
  recordId: string | number;
}

export class CloudTasksService {
  private client: CloudTasksClient;
  private projectId: string;
  private location: string;
  private queueName: string;
  private serviceUrl: string;

  constructor() {
    this.client = new CloudTasksClient();
    this.projectId = process.env['GCP_PROJECT_ID'] || '';
    this.location = process.env['GCP_LOCATION'] || 'europe-west1';
    this.queueName = process.env['GCP_QUEUE_NAME'] || 'video-processing-queue';
    this.serviceUrl = process.env['GCP_SERVICE_URL'] || '';
  }

  async createVideoProcessingTask(payload: TaskPayload): Promise<string> {
    try {
      if (!this.projectId) {
        throw new Error('GCP_PROJECT_ID non défini');
      }

      if (!this.serviceUrl) {
        throw new Error('GCP_SERVICE_URL non défini');
      }

      console.log('📋 Création d\'une tâche Cloud Tasks:', {
        projectId: this.projectId,
        location: this.location,
        queueName: this.queueName,
        serviceUrl: this.serviceUrl
      });

      const parent = this.client.queuePath(this.projectId, this.location, this.queueName);
      
      const task: protos.google.cloud.tasks.v2.ITask = {
        httpRequest: {
          httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
          url: `${this.serviceUrl}/task/process-video`,
          body: Buffer.from(JSON.stringify(payload)).toString('base64'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env['GCP_SERVICE_TOKEN'] || ''}`
          }
        }
      };

      const [response] = await this.client.createTask({
        parent,
        task
      });

      console.log('✅ Tâche Cloud Tasks créée:', response.name);
      return response.name || '';

    } catch (error) {
      console.error('❌ Erreur lors de la création de la tâche Cloud Tasks:', error);
      throw error;
    }
  }

  async createQueueIfNotExists(): Promise<void> {
    try {
      if (!this.projectId) {
        console.warn('⚠️ GCP_PROJECT_ID non défini, impossible de créer la queue');
        return;
      }

      const parent = this.client.locationPath(this.projectId, this.location);
      const queuePath = this.client.queuePath(this.projectId, this.location, this.queueName);

      try {
        // Essayer de récupérer la queue existante
        await this.client.getQueue({ name: queuePath });
        console.log('✅ Queue Cloud Tasks existante:', this.queueName);
      } catch (error: any) {
        if (error.code === 5) { // NOT_FOUND
          // Créer la queue
          console.log('📋 Création de la queue Cloud Tasks:', this.queueName);
          
          const [queue] = await this.client.createQueue({
            parent,
            queue: {
              name: queuePath,
              rateLimits: {
                maxConcurrentDispatches: 10,
                maxDispatchesPerSecond: 5
              },
              retryConfig: {
                maxAttempts: 3,
                maxRetryDuration: { seconds: 3600 }, // 1 heure
                minBackoff: { seconds: 10 },
                maxBackoff: { seconds: 300 }
              }
            }
          });

          console.log('✅ Queue Cloud Tasks créée:', queue.name);
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('❌ Erreur lors de la création de la queue Cloud Tasks:', error);
      // Ne pas faire échouer l'application si la queue ne peut pas être créée
    }
  }
} 