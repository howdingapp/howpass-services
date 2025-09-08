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

      // Récupérer les règles IA spécifiques au type de conversation
      try {
        const { data: iaRules, error } = await this.supabaseService.getSupabaseClient()
          .from('ia_rules')
          .select('*')
          .eq('type', howanaContext.type)
          .eq('is_active', true)
          .order('priority', { ascending: true });

        if (error) {
          console.error('❌ Erreur lors de la récupération des règles IA:', error);
        } else {
          // Transformer les données de snake_case vers camelCase
          const transformedRules = (iaRules || []).map(rule => ({
            id: rule.id,
            type: rule.type,
            name: rule.name,
            description: rule.description,
            priority: rule.priority,
            isActive: rule.is_active,
            createdAt: new Date(rule.created_at),
            updatedAt: new Date(rule.updated_at)
          }));

          howanaContext.iaRules = transformedRules;
          console.log(`✅ ${transformedRules.length} règles IA récupérées pour le type: ${howanaContext.type}`);
        }
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des règles IA:', error);
      }

      return howanaContext;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du contexte:', error);
      return null;
    }
  }

}
