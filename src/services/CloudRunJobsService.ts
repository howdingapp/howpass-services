import { google } from 'googleapis';
import { RgpdJobPayload } from '../types/rgpd';

export interface JobPayload {
  mergeRequest?: any;
  table?: string;
  recordId?: string | number;
  rgpdRequest?: RgpdJobPayload;
}

export class CloudRunJobsService {
  private projectId: string;
  private location: string;
  private videoJobName: string;
  private rgpdJobName: string;

  constructor() {
    this.projectId = process.env['GCP_PROJECT_ID'] || '';
    this.location = process.env['GCP_LOCATION'] || 'europe-west1';
    this.videoJobName = process.env['GCP_VIDEO_JOB_NAME'] || 'video-processing-job';
    this.rgpdJobName = process.env['GCP_RGPD_JOB_NAME'] || 'rgpd-processing-job';
  }

  async createVideoProcessingJob(payload: JobPayload): Promise<string> {
    try {
      if (!this.projectId) {
        throw new Error('GCP_PROJECT_ID non défini');
      }

      console.log('📋 Création d\'un job Cloud Run (vidéo):', {
        projectId: this.projectId,
        location: this.location,
        jobName: this.videoJobName,
        payload: { table: payload.table, recordId: payload.recordId }
      });

      const run = google.run('v2');
      const auth = await google.auth.getClient({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });

      const jobPath = `projects/${this.projectId}/locations/${this.location}/jobs/${this.videoJobName}`;

      const response = await run.projects.locations.jobs.run({
        name: jobPath,
        auth,
        requestBody: {
          overrides: {
            containerOverrides: [
              {
                env: [
                  { name: 'MERGE_REQUEST', value: JSON.stringify(payload.mergeRequest) },
                  { name: 'TABLE', value: payload.table || '' },
                  { name: 'RECORD_ID', value: payload.recordId?.toString() || '' },
                ]
              }
            ]
          }
        }
      });

      console.log('✅ Job Cloud Run créé:', response);
      return 'job-created';

    } catch (error) {
      console.error('❌ Erreur lors de la création du job Cloud Run:', error);
      throw error;
    }
  }

  async createRgpdProcessingJob(payload: JobPayload): Promise<string> {
    try {
      if (!this.projectId) {
        throw new Error('GCP_PROJECT_ID non défini');
      }

      if (!payload.rgpdRequest) {
        throw new Error('RgpdRequest manquant dans le payload');
      }

      console.log('📋 Création d\'un job Cloud Run (RGPD):', {
        projectId: this.projectId,
        location: this.location,
        jobName: this.rgpdJobName,
        requestId: payload.rgpdRequest.requestId,
        requestType: payload.rgpdRequest.requestType
      });

      const run = google.run('v2');
      const auth = await google.auth.getClient({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });

      const jobPath = `projects/${this.projectId}/locations/${this.location}/jobs/${this.rgpdJobName}`;

      const response = await run.projects.locations.jobs.run({
        name: jobPath,
        auth,
        requestBody: {
          overrides: {
            containerOverrides: [
              {
                env: [
                  { name: 'RGPD_REQUEST', value: JSON.stringify(payload.rgpdRequest) },
                  { name: 'REQUEST_ID', value: payload.rgpdRequest.requestId },
                  { name: 'USER_ID', value: payload.rgpdRequest.userId },
                  { name: 'REQUEST_TYPE', value: payload.rgpdRequest.requestType },
                  { name: 'EMAIL', value: payload.rgpdRequest.email },
                ]
              }
            ]
          }
        }
      });

      console.log('✅ Job RGPD Cloud Run créé:', response);
      return 'rgpd-job-created';

    } catch (error) {
      console.error('❌ Erreur lors de la création du job RGPD Cloud Run:', error);
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