import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { spawn } from 'child_process';
import { VideoController } from './controllers/VideoController';
import conversationRoutes from './routes/conversationRoutes';
import iaJobsRoutes from './routes/iaJobsRoutes';
import { redisService } from './services/RedisService';
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

// Vérifier que Redis est disponible et démarrer le serveur
async function checkRedisAndStartServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redisService.isRedisConnected()) {
      // Redis est déjà connecté
      console.log('✅ Redis déjà connecté, démarrage immédiat du serveur...');
      setupRedisEventHandlers();
      startExpressServer();
      resolve();
      return;
    }

    console.log('⏳ En attente de la connexion Redis...');
    
    // ✅ Écouter l'événement 'connected' de Redis
    const redisClient = redisService.getClient();
    redisClient.once('connected', () => {
      console.log('🔌 Redis connecté ! Démarrage du serveur...');
      
      // ✅ Configurer les événements Redis une fois connecté
      setupRedisEventHandlers();
      
      // ✅ Démarrer le serveur Express dans le callback Redis
      startExpressServer();
      
      resolve();
    });

    // Timeout de sécurité (30 secondes)
    setTimeout(() => {
      if (!redisService.isRedisConnected()) {
        console.error('❌ Timeout: Redis n\'a pas pu se connecter en 30 secondes');
        reject(new Error('Redis connection timeout'));
      }
    }, 30000);
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

// ✅ Endpoint de santé Redis (disponible une fois Redis initialisé)
app.get('/health/redis', async (_req, res) => {
  try {
    const isConnected = redisService.isRedisConnected();
    const isHealthy = isConnected ? await redisService.healthCheck() : false;
    
    if (isConnected && isHealthy) {
      res.json({
        status: 'healthy',
        service: 'redis',
        timestamp: new Date().toISOString(),
        host: process.env['REDIS_HOST'] || 'localhost',
        port: process.env['REDIS_PORT'] || '6379',
        connection: 'connected',
        health: 'healthy'
      });
    } else if (isConnected && !isHealthy) {
      res.status(503).json({
        status: 'degraded',
        service: 'redis',
        timestamp: new Date().toISOString(),
        host: process.env['REDIS_HOST'] || 'localhost',
        port: process.env['REDIS_PORT'] || '6379',
        connection: 'connected',
        health: 'unhealthy',
        error: 'Redis health check failed'
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        service: 'redis',
        timestamp: new Date().toISOString(),
        host: process.env['REDIS_HOST'] || 'localhost',
        port: process.env['REDIS_PORT'] || '6379',
        connection: 'disconnected',
        health: 'unknown',
        error: 'Redis not connected'
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'error',
      service: 'redis',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Routes des conversations
app.use('/api/conversations', conversationRoutes);

// Routes des jobs IA
app.use('/api/ia/jobs', iaJobsRoutes);

// Démarrage du serveur Express
function startExpressServer(): void {
  app.listen(port, () => {
    console.log(`🚀 Serveur démarré sur le port ${port}`);
    console.log(`📊 Environnement: ${process.env['NODE_ENV']}`);
    console.log(`🎬 FFmpeg threads: ${process.env['FFMPEG_THREADS'] || 4}`);
    console.log(`⏱️ FFmpeg timeout: ${process.env['FFMPEG_TIMEOUT'] || 300000}ms`);
    console.log(`☁️ GCP Project ID: ${process.env['GCP_PROJECT_ID'] || 'Non défini'}`);
    console.log(`📋 GCP Job: ${process.env['GCP_JOB_NAME'] || 'video-processing-job'}`);
    console.log(`🔴 Redis: ${process.env['REDIS_HOST'] || 'localhost'}:${process.env['REDIS_PORT'] || '6379'}`);
  });
}

// Démarrage du serveur principal
async function startServer() {
  try {
    // Vérifier FFmpeg avant de démarrer
    const ffmpegAvailable = await checkFFmpeg();
    if (!ffmpegAvailable) {
      console.error('❌ Le service ne peut pas démarrer sans FFmpeg');
      process.exit(1);
    }

    // ✅ Attendre Redis ET démarrer le serveur dans le callback
    await checkRedisAndStartServer();
    
  } catch (error) {
    console.error('❌ Erreur lors du démarrage du serveur:', error);
    process.exit(1);
  }
}

/**
 * Configurer les gestionnaires d'événements Redis pour le monitoring en continu
 */
function setupRedisEventHandlers(): void {
  const redisClient = redisService.getClient();
  
  // ✅ Écouter la déconnexion Redis
  redisClient.on('disconnected', () => {
    console.warn('⚠️ Redis déconnecté - Le serveur reste actif mais certaines fonctionnalités peuvent être limitées');
  });

  // ✅ Écouter la reconnexion Redis
  redisClient.on('connected', () => {
    console.log('🔌 Redis reconnecté - Toutes les fonctionnalités sont à nouveau disponibles');
  });

  // ✅ Écouter les erreurs Redis
  redisClient.on('error', (error) => {
    console.error('❌ Erreur Redis:', error);
  });

  // ✅ Écouter la fin de la connexion
  redisClient.on('end', () => {
    console.warn('🔌 Connexion Redis fermée');
  });

  // ✅ Écouter la fermeture de la connexion
  redisClient.on('close', () => {
    console.warn('🔌 Connexion Redis fermée (close)');
  });

  console.log('✅ Gestionnaires d\'événements Redis configurés pour le monitoring en continu');
}

startServer();

// Gestion de l'arrêt gracieux
process.on('SIGTERM', async () => {
  console.log('🛑 Signal SIGTERM reçu, arrêt gracieux...');
  await redisService.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Signal SIGINT reçu, arrêt gracieux...');
  await redisService.disconnect();
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