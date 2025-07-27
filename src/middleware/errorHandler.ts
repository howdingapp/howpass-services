import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let error = { ...err };
  error.message = err.message;

  // Log de l'erreur
  console.error('Erreur:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Erreur de validation Multer
  if (err.name === 'MulterError') {
    const message = 'Erreur lors de l\'upload du fichier';
    error = {
      name: 'MulterError',
      message,
      statusCode: 400
    };
  }

  // Erreur de type de fichier
  if (err.message.includes('Type de fichier non supporté')) {
    error.statusCode = 400;
  }

  // Erreur de taille de fichier
  if (err.message.includes('File too large')) {
    error.statusCode = 400;
    error.message = 'Fichier trop volumineux';
  }

  // Erreur FFmpeg
  if (err.message.includes('FFmpeg')) {
    error.statusCode = 500;
    error.message = 'Erreur lors du traitement vidéo';
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Erreur interne du serveur',
    ...(process.env['NODE_ENV'] === 'development' && { stack: err.stack })
  });
};

export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} non trouvée`
  });
}; 