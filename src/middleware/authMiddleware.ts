import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

// Configuration Supabase
const supabaseUrl = process.env['SUPABASE_URL']!;
const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
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

    // Ajouter les informations utilisateur à la requête
    req.user = {
      id: user.id,
      ...(user.email && { email: user.email }),
      ...(user.role && { role: user.role })
    };

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
