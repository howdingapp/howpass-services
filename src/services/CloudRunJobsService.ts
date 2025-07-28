import { google } from 'googleapis';

export interface JobPayload {
  mergeRequest: any;
  table: string;
  recordId: string | number;
}

export class CloudRunJobsService {
  private projectId: string;
  private location: string;
  private jobName: string;

  constructor() {
    this.projectId = process.env['GCP_PROJECT_ID'] || '';
    this.location = process.env['GCP_LOCATION'] || 'europe-west1';
    this.jobName = process.env['GCP_JOB_NAME'] || 'video-processing-job';
  }

  async createVideoProcessingJob(payload: JobPayload): Promise<string> {
    try {
      if (!this.projectId) {
        throw new Error('GCP_PROJECT_ID non défini');
      }

      console.log('📋 Création d\'un job Cloud Run:', {
        projectId: this.projectId,
        location: this.location,
        jobName: this.jobName
      });

      const run = google.run('v2');
      const auth = await google.auth.getClient({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });

      const jobPath = `projects/${this.projectId}/locations/${this.location}/jobs/${this.jobName}`;

      const response = await run.projects.locations.jobs.run({
        name: jobPath,
        auth
      });

      console.log('✅ Job Cloud Run créé:', response);
      return response.data?.name || '';

    } catch (error) {
      console.error('❌ Erreur lors de la création du job Cloud Run:', error);
      throw error;
    }
  }

  async checkJobStatus(executionName: string): Promise<any> {
    try {
      const run = google.run('v2');
      const auth = await google.auth.getClient({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });

      const response = await run.projects.locations.jobs.executions.get({
        name: executionName,
        auth
      });

      return response.data;
    } catch (error) {
      console.error('❌ Erreur lors de la vérification du statut du job:', error);
      throw error;
    }
  }
} 