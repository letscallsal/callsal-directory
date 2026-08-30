// Storage abstraction — Upstash Redis / Vercel KV in production, CRM Redis via directory secret, in-memory locally.

interface StorageInterface {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

const memoryStore: Record<string, unknown> = {};

const memoryStorage: StorageInterface = {
  async get<T>(key: string): Promise<T | null> {
    return (memoryStore[key] as T) ?? null;
  },
  async set<T>(key: string, value: T, _ttlSeconds?: number): Promise<void> {
    memoryStore[key] = value;
  },
  async del(key: string): Promise<void> {
    delete memoryStore[key];
  },
};

let redisStorage: StorageInterface | null = null;
let crmStorage: StorageInterface | null = null;

function crmOrigin(): string {
  return (process.env.CRM_API_URL || 'https://crm.callsal.app').replace(/\/$/, '');
}

function crmSecret(): string {
  return String(process.env.DIRECTORY_CRM_SECRET || '').trim();
}

function isRedisConfigured(): boolean {
  return !!(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

function isCrmStorageConfigured(): boolean {
  return Boolean(crmSecret());
}

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
      async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        if (ttlSeconds && ttlSeconds > 0) {
          await redis.set(key, value, { ex: ttlSeconds });
          return;
        }
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

function getCrmStorage(): StorageInterface {
  if (crmStorage) return crmStorage;
  const origin = crmOrigin();
  const secret = crmSecret();
  crmStorage = {
    async get<T>(key: string): Promise<T | null> {
      const res = await fetch(`${origin}/api/directory/kv?key=${encodeURIComponent(key)}`, {
        headers: { 'x-directory-key': secret },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { value?: T | null };
      return (data?.value ?? null) as T | null;
    },
    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
      await fetch(`${origin}/api/directory/kv`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-directory-key': secret },
        body: JSON.stringify({ key, value, ttl: ttlSeconds || 0 }),
      });
    },
    async del(key: string): Promise<void> {
      await fetch(`${origin}/api/directory/kv?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: { 'x-directory-key': secret },
      });
    },
  };
  return crmStorage;
}

export function isPersistentStorage(): boolean {
  return isRedisConfigured() || isCrmStorageConfigured();
}

export async function getStorage(): Promise<StorageInterface> {
  if (isRedisConfigured()) {
    return getRedisStorage();
  }
  if (isCrmStorageConfigured()) {
    return getCrmStorage();
  }
  if (process.env.VERCEL === '1') {
    console.warn('KV/Upstash missing; accounts persist in the signed session cookie');
  }
  return memoryStorage;
}

export type { StorageInterface };
