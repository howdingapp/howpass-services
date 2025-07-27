import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import videoRoutes from './routes/videoRoutes';
import { errorHandler, notFound } from './middleware/errorHandler';

// Charger les variables d'environnement
dotenv.config();

const app = express();
const PORT = process.env['PORT'] || 3000;

// Middleware de sécurité
app.use(helmet({
  contentSecurityPolicy: false, // Désactiver pour le développement
  crossOriginEmbedderPolicy: false
}));

// Middleware CORS
app.use(cors({
  origin: process.env['CORS_ORIGIN'] || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware de compression
app.use(compression());

// Middleware pour parser le JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/video', videoRoutes);

// Route racine
app.get('/', (_req, res) => {
  res.json({
    message: 'HowPass Video Service API',
    version: '1.0.0',
    endpoints: {
      merge: '/api/video/merge'
    }
  });
});

// Middleware de gestion d'erreurs
app.use(notFound);
app.use(errorHandler);

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur HowPass Video Service démarré sur le port ${PORT}`);
  console.log(`📁 Répertoires:`);
  console.log(`   Upload: ${process.env['UPLOAD_PATH'] || './uploads'}`);
  console.log(`   Temp: ${process.env['TEMP_PATH'] || './temp'}`);
  console.log(`   Output: ${process.env['OUTPUT_PATH'] || './output'}`);
  console.log(`🔧 Environnement: ${process.env['NODE_ENV'] || 'development'}`);
});

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