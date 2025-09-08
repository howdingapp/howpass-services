  import { SupabaseService } from './SupabaseService';
import {
  StartConversationRequest,
} from '../types/conversation';
import { HowanaContext } from '../types/repositories';

export class ConversationService {
  private supabaseService: SupabaseService;

  constructor() {
    // Initialiser le service Supabase
    this.supabaseService = new SupabaseService();
  }

  /**
   * Démarrer une nouvelle conversation
   */
  async startConversation(request: StartConversationRequest): Promise<{ conversationId: string; context: HowanaContext }> {
    const conversationId = request.conversationId;
    const now = new Date().toISOString();

    console.log('🔍 Sauvegarde d\'une nouvelle conversation:', request);
    console.log('🔍 Conversation ID:', conversationId);
    console.log('🕐 Heure de création:', now);
    
    // Créer un contexte par défaut
    const context: HowanaContext = {
      type: request.type,
      userData: {
        firstName: '',
        lastName: '',
        age: 0,
        experience: ''
      }
    } as HowanaContext;

    console.log('🔍 Conversation context:', context);

    return { conversationId, context };
  }

  /**
   * Récupérer le contexte d'une conversation depuis Supabase
   */
  async getContext(conversationId: string): Promise<HowanaContext | null> {
    try {
      // Utiliser la fonction getContext de SupabaseService
      const howanaContext = await this.supabaseService.getContext(conversationId);
      
      if (!howanaContext) {
        console.log('⚠️ Contexte Howana non trouvé pour la conversation:', conversationId);
        return null;
      }


      return howanaContext;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du contexte:', error);
      return null;
    }
  }

}
