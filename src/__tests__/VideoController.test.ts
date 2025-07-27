import request from 'supertest';
import express from 'express';
import { VideoController } from '../controllers/VideoController';
import videoRoutes from '../routes/videoRoutes';

const app = express();
app.use(express.json());
app.use('/api/video', videoRoutes);

describe('VideoController', () => {
  describe('POST /api/video/merge', () => {
    it('should return 400 when prefixVideoUrl is missing', async () => {
      const response = await request(app)
        .post('/api/video/merge')
        .send({
          postfixVideoUrl: 'https://example.com/video2.mp4'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('prefixVideoUrl');
    });

    it('should return 400 when postfixVideoUrl is missing', async () => {
      const response = await request(app)
        .post('/api/video/merge')
        .send({
          prefixVideoUrl: 'https://example.com/video1.mp4'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('postfixVideoUrl');
    });

    it('should return 400 when URLs are invalid', async () => {
      const response = await request(app)
        .post('/api/video/merge')
        .send({
          prefixVideoUrl: 'invalid-url',
          postfixVideoUrl: 'also-invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('URLs');
    });

    it('should return 400 when quality is invalid', async () => {
      const response = await request(app)
        .post('/api/video/merge')
        .send({
          prefixVideoUrl: 'https://example.com/video1.mp4',
          postfixVideoUrl: 'https://example.com/video2.mp4',
          quality: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('qualité');
    });

    it('should return 400 when resolution is invalid', async () => {
      const response = await request(app)
        .post('/api/video/merge')
        .send({
          prefixVideoUrl: 'https://example.com/video1.mp4',
          postfixVideoUrl: 'https://example.com/video2.mp4',
          resolution: 'invalid-resolution'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('résolution');
    });

    it('should return 400 when fps is invalid', async () => {
      const response = await request(app)
        .post('/api/video/merge')
        .send({
          prefixVideoUrl: 'https://example.com/video1.mp4',
          postfixVideoUrl: 'https://example.com/video2.mp4',
          fps: -1
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('FPS');
    });
  });

  describe('GET /api/video/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/video/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('howpass-video-service');
    });
  });

  describe('GET /api/video/job/:jobId', () => {
    it('should return 400 when jobId is missing', async () => {
      const response = await request(app)
        .get('/api/video/job/');

      expect(response.status).toBe(404);
    });

    it('should return 404 when job is not found', async () => {
      const response = await request(app)
        .get('/api/video/job/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Job non trouvé');
    });
  });
}); 