// Services de base
export { BaseChatBotService } from './BaseChatBotService';

// Services spécialisés
export { ActivityChatBotService } from './ActivityChatBotService';
export { BilanChatBotService } from './BilanChatBotService';
export { RecommendationChatBotService } from './RecommendationChatBotService';

// Factory et service unifié
export { ChatBotServiceFactory } from './ChatBotServiceFactory';

// Services existants (pour compatibilité)
export { ChatBotService } from './ChatBotService';
export { ConversationService } from './ConversationService';
export { SupabaseService } from './SupabaseService';
