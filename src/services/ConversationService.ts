import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import {
  ConversationContext,
  ChatMessage,
  StartConversationRequest,
  AddMessageRequest,
  ConversationSummary,
  ConversationStats
} from '../types/conversation';

export class ConversationService {
  private redis: Redis;
  private readonly TTL_SECONDS = 1800; // 30 minutes en secondes
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Nettoyage toutes les 5 minutes

  constructor() {
    // Configuration Redis
    this.redis = new Redis({
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379'),
      ...(process.env['REDIS_PASSWORD'] && { password: process.env['REDIS_PASSWORD'] }),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    // Gestion des erreurs Redis
    this.redis.on('error', (error: Error) => {
      console.error('❌ Erreur Redis:', error);
    });

    this.redis.on('connect', () => {
      console.log('✅ Connecté à Redis');
    });

    // Démarrer le nettoyage automatique (pour les conversations orphelines)
    this.startCleanupScheduler();
  }

  /**
   * Démarrer une nouvelle conversation
   */
  async startConversation(request: StartConversationRequest): Promise<{ conversationId: string; context: ConversationContext }> {
    const conversationId = uuidv4();
    const now = new Date().toISOString();

    const context: ConversationContext = {
      id: conversationId,
      userId: request.userId,
      type: request.type,
      startTime: now,
      lastActivity: now,
      messages: [],
      metadata: request.initialContext || {},
      status: 'active',
      ...(request.initialContext?.aiRules && { aiRules: request.initialContext.aiRules }),
      ...(request.initialContext?.activityData && { activityData: request.initialContext.activityData })
    };

    // Stocker avec TTL automatique
    await this.redis.setex(conversationId, this.TTL_SECONDS, JSON.stringify(context));

    return { conversationId, context };
  }

  /**
   * Ajouter un message à une conversation
   */
  async addMessage(conversationId: string, request: AddMessageRequest): Promise<{ messageId: string; context: ConversationContext }> {
    const context = await this.getContext(conversationId);
    if (!context) {
      throw new Error('Conversation not found');
    }

    if (context.status !== 'active') {
      throw new Error('Conversation is not active');
    }

    const messageId = uuidv4();
    const now = new Date().toISOString();

    const message: ChatMessage = {
      id: messageId,
      content: request.content,
      type: request.type,
      timestamp: now,
      ...(request.metadata && { metadata: request.metadata })
    };

    context.messages.push(message);
    context.lastActivity = now;

    // Renouveler le TTL en mettant à jour la conversation
    await this.redis.setex(conversationId, this.TTL_SECONDS, JSON.stringify(context));

    return { messageId, context };
  }

  /**
   * Récupérer le contexte d'une conversation
   */
  async getContext(conversationId: string): Promise<ConversationContext | null> {
    try {
      const contextData = await this.redis.get(conversationId);
      if (!contextData) {
        return null;
      }

      const context: ConversationContext = JSON.parse(contextData);
      
      // Vérifier si la conversation a expiré (double vérification)
      const lastActivity = new Date(context.lastActivity);
      const now = new Date();
      if ((now.getTime() - lastActivity.getTime()) > (this.TTL_SECONDS * 1000)) {
        await this.redis.del(conversationId);
        return null;
      }

      return context;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du contexte:', error);
      return null;
    }
  }

  /**
   * Terminer une conversation et générer un résumé
   */
  async endConversation(conversationId: string): Promise<ConversationSummary> {
    const context = await this.getContext(conversationId);
    if (!context) {
      throw new Error('Conversation not found');
    }

    const now = new Date();
    const endTime = now.toISOString();
    const startTime = new Date(context.startTime);
    const duration = now.getTime() - startTime.getTime();

    const summary: ConversationSummary = {
      conversationId,
      userId: context.userId,
      type: context.type,
      startTime: context.startTime,
      endTime,
      duration,
      messageCount: context.messages.length,
      summary: this.generateSummary(context)
    };

    // Supprimer la conversation
    await this.redis.del(conversationId);

    return summary;
  }

  /**
   * Obtenir les statistiques du service
   */
  async getStats(): Promise<ConversationStats> {
    try {
      const now = new Date();
      
      // Compter les conversations actives (clés avec TTL > 0)
      const keys = await this.redis.keys('*');
      let activeCount = 0;
      let totalSize = 0;

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl > 0) {
          activeCount++;
          const contextData = await this.redis.get(key);
          if (contextData) {
            totalSize += contextData.length;
          }
        }
      }

      return {
        activeConversations: activeCount,
        totalConversations: keys.length,
        memoryUsage: totalSize,
        timestamp: now.toISOString()
      };
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des statistiques:', error);
      return {
        activeConversations: 0,
        totalConversations: 0,
        memoryUsage: 0,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Générer un résumé de la conversation
   */
  private generateSummary(context: ConversationContext): string {
    const userMessages = context.messages.filter(m => m.type === 'user').length;
    const botMessages = context.messages.filter(m => m.type === 'bot').length;
    
    return `Conversation ${context.type} avec ${userMessages} messages utilisateur et ${botMessages} réponses du bot. Type: ${context.type}`;
  }

  /**
   * Démarrer le planificateur de nettoyage automatique
   */
  private startCleanupScheduler(): void {
    setInterval(async () => {
      try {
        await this.cleanupExpiredConversations();
      } catch (error) {
        console.error('❌ Erreur lors du nettoyage automatique:', error);
      }
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Nettoyer les conversations expirées (pour les conversations orphelines)
   */
  private async cleanupExpiredConversations(): Promise<void> {
    try {
      const keys = await this.redis.keys('*');
      let cleanedCount = 0;

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1 || ttl === -2) { // Pas de TTL ou clé inexistante
          await this.redis.del(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Nettoyage automatique: ${cleanedCount} conversations orphelines supprimées`);
      }
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage automatique:', error);
    }
  }

  /**
   * Forcer le nettoyage de toutes les conversations (pour les tests)
   */
  async forceCleanup(): Promise<void> {
    try {
      const keys = await this.redis.keys('*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      console.log('🧹 Nettoyage forcé: toutes les conversations supprimées');
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage forcé:', error);
    }
  }

  /**
   * Fermer la connexion Redis
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
