import { Request, Response, NextFunction } from 'express';
import { SupabaseService } from '../services/SupabaseService';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
  authToken?: string; // Token d'authentification pour les tâches IA
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Token d\'authentification manquant',
        data: {
          details: 'Header Authorization avec Bearer token requis'
        }
      });
    }

    // Utiliser SupabaseService pour vérifier le token
    const supabaseService = new SupabaseService();
    const supabase = supabaseService.getSupabaseClient();
    
    // Vérifier le token avec Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('❌ Erreur d\'authentification:', error);
      return res.status(401).json({
        success: false,
        error: 'Token invalide ou expiré',
        data: {
          details: 'Le token d\'authentification n\'est pas valide'
        }
      });
    }

    // Ajouter les informations utilisateur et le token à la requête
    req.user = {
      id: user.id,
      ...(user.email && { email: user.email }),
      ...(user.role && { role: user.role })
    };
    
    // Ajouter le token d'authentification pour les tâches IA
    req.authToken = token;

    console.log(`✅ Utilisateur authentifié: ${user.email} (${user.id})`);
    return next();
  } catch (error) {
    console.error('❌ Erreur dans le middleware d\'authentification:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification du token',
      data: {
        details: 'Erreur interne du serveur'
      }
    });
  }
};
