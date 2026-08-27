// Storage abstraction — Upstash Redis / Vercel KV in production, in-memory locally.
// Same pattern as letscallsal/callsal-website api/lib/storage.ts

interface StorageInterface {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}

const memoryStore: Record<string, unknown> = {};

const memoryStorage: StorageInterface = {
  async get<T>(key: string): Promise<T | null> {
    return (memoryStore[key] as T) ?? null;
  },
  async set<T>(key: string, value: T): Promise<void> {
    memoryStore[key] = value;
  },
  async del(key: string): Promise<void> {
    delete memoryStore[key];
  },
};

let redisStorage: StorageInterface | null = null;

async function getRedisStorage(): Promise<StorageInterface> {
  if (redisStorage) return redisStorage;

  try {
    const { Redis } = await import('@upstash/redis');
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    const redis = new Redis({ url: url!, token: token! });

    redisStorage = {
      async get<T>(key: string): Promise<T | null> {
        return await redis.get<T>(key);
      },
      async set<T>(key: string, value: T): Promise<void> {
        await redis.set(key, value);
      },
      async del(key: string): Promise<void> {
        await redis.del(key);
      },
    };
    return redisStorage;
  } catch (e) {
    console.error('Upstash Redis not available', e);
    if (process.env.VERCEL === '1') throw e;
    return memoryStorage;
  }
}

function isRedisConfigured(): boolean {
  return !!(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

export async function getStorage(): Promise<StorageInterface> {
  if (isRedisConfigured()) {
    return getRedisStorage();
  }
  return memoryStorage;
}

export type { StorageInterface };
