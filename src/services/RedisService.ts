import Redis from 'ioredis';

export class RedisService {
  private static instance: RedisService;
  private redis: Redis;
  private isConnected: boolean = false;

  private constructor() {
    this.redis = new Redis({
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379'),
      ...(process.env['REDIS_PASSWORD'] && { password: process.env['REDIS_PASSWORD'] }),
      maxRetriesPerRequest: 3,
      lazyConnect: false, // ✅ Connexion immédiate
      enableOfflineQueue: true, // ✅ Queue en cas de déconnexion
      connectTimeout: 10000, // 10 secondes max pour la connexion
      commandTimeout: 5000,  // 5 secondes max pour les commandes
    });

    this.setupEventHandlers();
  }

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  /**
   * Attendre que Redis soit connecté (pour éviter les race conditions)
   */
  public async waitForConnection(timeoutMs: number = 10000): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isConnected) {
        resolve(true);
        return;
      }

      const timeout = setTimeout(() => {
        resolve(false);
      }, timeoutMs);

      const checkConnection = () => {
        if (this.isConnected) {
          clearTimeout(timeout);
          resolve(true);
        } else {
          setTimeout(checkConnection, 100);
        }
      };

      checkConnection();
    });
  }

  private setupEventHandlers(): void {
    this.redis.on('error', (error: Error) => {
      console.error('❌ Erreur Redis:', error);
      this.isConnected = false;
    });

    this.redis.on('connect', () => {
      console.log('✅ Connecté à Redis');
      this.isConnected = true;
    });

    this.redis.on('ready', () => {
      console.log('🚀 Redis prêt à recevoir des commandes');
      this.isConnected = true;
    });

    this.redis.on('close', () => {
      console.log('🔌 Connexion Redis fermée');
      this.isConnected = false;
    });

    this.redis.on('reconnecting', () => {
      console.log('🔄 Reconnexion à Redis...');
    });
  }

  public getClient(): Redis {
    return this.redis;
  }

  public isRedisConnected(): boolean {
    return this.isConnected;
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // Vérifier d'abord que la connexion est établie
      const isConnected = await this.waitForConnection(5000);
      if (!isConnected) {
        console.error('❌ Redis pas connecté après 5 secondes');
        return false;
      }

      // Puis faire un ping
      await this.redis.ping();
      return true;
    } catch (error) {
      console.error('❌ Health check Redis échoué:', error);
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
    }
  }

  public async flushAll(): Promise<void> {
    if (this.redis) {
      await this.redis.flushall();
    }
  }
}

// Export de l'instance unique
export const redisService = RedisService.getInstance();
