import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { spawn } from 'child_process';
import { VideoController } from './controllers/VideoController';
import conversationRoutes from './routes/conversationRoutes';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

const app = express();
const port = process.env['PORT'] || 3000;

// Vérifier que FFmpeg est disponible
function checkFFmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('✅ FFmpeg est disponible');
        resolve(true);
      } else {
        console.error('❌ FFmpeg n\'est pas disponible');
        resolve(false);
      }
    });
    
    ffmpeg.on('error', (err) => {
      console.error('❌ Erreur lors de la vérification de FFmpeg:', err);
      resolve(false);
    });
  });
}

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env['CORS_ORIGIN'] || '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
const videoController = new VideoController();

// Routes vidéo
app.post('/webhook/database', (req, res) => {
  videoController.handleDatabaseWebhook(req, res);
});

app.get('/job/:executionName', (req, res) => {
  videoController.getJobStatus(req, res);
});

app.get('/health', (req, res) => {
  videoController.getHealth(req, res);
});

// Routes des conversations
app.use('/api/conversations', conversationRoutes);

// Démarrage du serveur
async function startServer() {
  try {
    // Vérifier FFmpeg avant de démarrer
    const ffmpegAvailable = await checkFFmpeg();
    if (!ffmpegAvailable) {
      console.error('❌ Le service ne peut pas démarrer sans FFmpeg');
      process.exit(1);
    }

    app.listen(port, () => {
      console.log(`🚀 Serveur démarré sur le port ${port}`);
      console.log(`📊 Environnement: ${process.env['NODE_ENV']}`);
      console.log(`🎬 FFmpeg threads: ${process.env['FFMPEG_THREADS'] || 4}`);
      console.log(`⏱️ FFmpeg timeout: ${process.env['FFMPEG_TIMEOUT'] || 300000}ms`);
      console.log(`☁️ GCP Project ID: ${process.env['GCP_PROJECT_ID'] || 'Non défini'}`);
      console.log(`📋 GCP Job: ${process.env['GCP_JOB_NAME'] || 'video-processing-job'}`);
    });
  } catch (error) {
    console.error('❌ Erreur lors du démarrage du serveur:', error);
    process.exit(1);
  }
}

startServer();

// Gestion de l'arrêt gracieux
process.on('SIGTERM', () => {
  console.log('🛑 Signal SIGTERM reçu, arrêt gracieux...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Signal SIGINT reçu, arrêt gracieux...');
  process.exit(0);
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  console.error('❌ Erreur non capturée:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, _promise) => {
  console.error('❌ Promesse rejetée non gérée:', reason);
  process.exit(1);
}); 