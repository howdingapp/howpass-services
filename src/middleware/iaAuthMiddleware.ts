import { Request, Response, NextFunction } from 'express';
import { SupabaseService } from '../services/SupabaseService';

export interface IAAuthenticatedRequest extends Request {
  user?: {
    id: string;
    userId: string;
    email?: string;
    role?: string;
  };
  validatedAuthToken?: string;
}

/**
 * Middleware d'authentification spécifique pour les requêtes IA
 * Vérifie le token d'authentification dans le corps de la requête
 * (envoyé par Google Cloud Tasks) en utilisant Supabase
 */
export function authenticateIAToken(req: Request, res: Response, next: NextFunction): void {
  try {
    // Vérifier que le corps de la requête contient un token
    if (!req.body || !req.body.authToken) {
      console.warn('⚠️ Requête IA sans token d\'authentification');
      res.status(401).json({
        error: 'Token d\'authentification manquant',
        message: 'Le token d\'authentification est requis dans le corps de la requête'
      });
      return;
    }

    const { authToken } = req.body;

    // Vérifier que le token n'est pas vide
    if (!authToken || typeof authToken !== 'string' || authToken.trim() === '') {
      console.warn('⚠️ Requête IA avec token d\'authentification invalide');
      res.status(401).json({
        error: 'Token d\'authentification invalide',
        message: 'Le token d\'authentification doit être une chaîne non vide'
      });
      return;
    }

    // Ici vous pouvez ajouter une validation plus poussée du token
    // Par exemple, vérifier qu'il correspond à un token valide dans votre système
    // Pour l'instant, on accepte tout token non vide
    
    console.log('✅ Token d\'authentification IA validé');
    
    // Ajouter le token validé à la requête pour utilisation ultérieure
    (req as IAAuthenticatedRequest).validatedAuthToken = authToken;
    
    next();
    
  } catch (error) {
    console.error('❌ Erreur lors de la validation du token IA:', error);
    res.status(500).json({
      error: 'Erreur interne lors de la validation',
      message: 'Une erreur est survenue lors de la validation du token'
    });
  }
}

/**
 * Middleware pour extraire et valider le token depuis le corps de la requête
 * Version robuste avec authentification Supabase
 */
export async function validateIAToken(req: IAAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // S'assurer que le body est parsé
    if (!req.body) {
      console.warn('⚠️ Corps de la requête non parsé');
      res.status(400).json({
        error: 'Corps de la requête invalide',
        message: 'Le corps de la requête doit être un JSON valide'
      });
      return;
    }

    // Vérifier la structure de la requête
    if (!req.body.authToken) {
      console.warn('⚠️ Structure de requête IA invalide:', {
        hasBody: !!req.body,
        bodyKeys: Object.keys(req.body),
        contentType: req.headers['content-type']
      });
      
      res.status(400).json({
        error: 'Structure de requête invalide',
        message: 'La requête doit contenir un champ authToken dans le corps',
        expected: {
          authToken: 'string (requis)',
          type: 'string (requis)',
          conversationId: 'string (requis)',
          userId: 'string (requis)',
          priority: 'string (optionnel)',
          userMessage: 'string (optionnel)'
        }
      });
      return;
    }

    // Validation du token avec Supabase
    const { authToken } = req.body;
    
    if (typeof authToken !== 'string' || authToken.trim().length === 0) {
      console.warn('⚠️ Token d\'authentification IA invalide');
      res.status(401).json({
        error: 'Token d\'authentification invalide',
        message: 'Le token doit être une chaîne non vide'
      });
      return;
    }

    // Authentifier le token avec Supabase
    try {
      const supabaseService = new SupabaseService();
      const supabase = supabaseService.getSupabaseClient();
      
      // Vérifier le token avec Supabase
      const { data: { user }, error } = await supabase.auth.getUser(authToken);

      if (error || !user) {
        console.error('❌ Erreur d\'authentification Supabase:', error);
        res.status(401).json({
          error: 'Token invalide ou expiré',
          message: 'Le token d\'authentification n\'est pas valide'
        });
        return;
      }

      // Ajouter les informations utilisateur à la requête
      req.user = {
        id: user.id,
        userId: user.id,
        ...(user.email && { email: user.email }),
        ...(user.role && { role: user.role })
      };

      console.log(`✅ Utilisateur IA authentifié: ${user.email} (${user.id})`);
      
    } catch (authError) {
      console.error('❌ Erreur lors de l\'authentification Supabase:', authError);
      res.status(401).json({
        error: 'Erreur d\'authentification',
        message: 'Impossible de valider le token d\'authentification'
      });
      return;
    }

    // Validation des autres champs requis
    const requiredFields = ['type', 'conversationId'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      console.warn('⚠️ Champs requis manquants:', missingFields);
      res.status(400).json({
        error: 'Champs requis manquants',
        message: `Les champs suivants sont requis: ${missingFields.join(', ')}`,
        missing: missingFields
      });
      return;
    }

    // Validation du type de tâche
    const validTypes = ['generate_response', 'generate_summary', 'generate_first_response'];
    if (!validTypes.includes(req.body.type)) {
      console.warn('⚠️ Type de tâche IA invalide:', req.body.type);
      res.status(400).json({
        error: 'Type de tâche invalide',
        message: `Le type doit être l'un des suivants: ${validTypes.join(', ')}`,
        received: req.body.type,
        valid: validTypes
      });
      return;
    }

    console.log('✅ Requête IA validée avec succès:', {
      type: req.body.type,
      conversationId: req.body.conversationId,
      userId: req.body.userId,
      priority: req.body.priority || 'medium',
      userEmail: req.user?.email
    });

    // Ajouter le token validé à la requête
    req.validatedAuthToken = authToken;
    
    next();
    
  } catch (error) {
    console.error('❌ Erreur lors de la validation de la requête IA:', error);
    res.status(500).json({
      error: 'Erreur interne lors de la validation',
      message: 'Une erreur est survenue lors de la validation de la requête'
    });
  }
}
