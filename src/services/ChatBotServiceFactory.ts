import { BaseChatBotService } from './BaseChatBotService';
import { ActivityChatBotService } from './ActivityChatBotService';
import { BilanChatBotService } from './BilanChatBotService';
import { RecommendationChatBotService } from './RecommendationChatBotService';
import { ConversationContext } from '../types/conversation';

export class ChatBotServiceFactory {
  
  /**
   * Crée une instance du service de chatbot approprié selon le type de conversation
   */
  static createService(context: ConversationContext): BaseChatBotService {
    switch (context.type) {
      case 'activity':
        return new ActivityChatBotService();
      
      case 'bilan':
        return new BilanChatBotService();
      
      case 'recommandation':
        return new RecommendationChatBotService();
      
      default:
        throw new Error(`Type de conversation non supporté: ${context.type}. Types supportés: ${ChatBotServiceFactory.getSupportedTypes().join(', ')}`);
    }
  }

  /**
   * Crée une instance du service de chatbot approprié selon le type spécifié
   */
  static createServiceByType(type: 'activity' | 'bilan' | 'recommandation'): BaseChatBotService {
    switch (type) {
      case 'activity':
        return new ActivityChatBotService();
      
      case 'bilan':
        return new BilanChatBotService();
      
      case 'recommandation':
        return new RecommendationChatBotService();
      
      default:
        throw new Error(`Type de service inconnu: ${type}. Types supportés: ${ChatBotServiceFactory.getSupportedTypes().join(', ')}`);
    }
  }

  /**
   * Vérifie si un type de service est supporté
   */
  static isSupportedType(type: string): boolean {
    return ['activity', 'bilan', 'recommandation'].includes(type);
  }

  /**
   * Liste tous les types de services supportés
   */
  static getSupportedTypes(): string[] {
    return ['activity', 'bilan', 'recommandation'];
  }
}
