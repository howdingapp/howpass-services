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
      lazyConnect: true,
      enableOfflineQueue: false,

    });

    this.setupEventHandlers();
  }

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
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
