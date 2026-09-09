import { createHash } from "node:crypto";

import { loadRedisEnvironment } from "@townhawll/config/server-env";
import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

const globalForCache = globalThis as typeof globalThis & {
  townhawllRedis?: RedisClient;
  townhawllRedisConnection?: Promise<RedisClient>;
};

function getClient(): RedisClient {
  if (globalForCache.townhawllRedis) {
    return globalForCache.townhawllRedis;
  }

  const { REDIS_URL } = loadRedisEnvironment();
  const client = createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: 2_000,
      reconnectStrategy: (retries) => (retries >= 1 ? false : 100),
    },
  });

  client.on("error", () => {
    // Connection failures are handled by callers. Never log command data here.
  });

  globalForCache.townhawllRedis = client;
  return client;
}

async function getConnectedClient(): Promise<RedisClient> {
  const client = getClient();

  if (client.isReady) {
    return client;
  }

  globalForCache.townhawllRedisConnection ??= client
    .connect()
    .then(() => client)
    .catch((error: unknown) => {
      if (client.isOpen) client.destroy();
      if (globalForCache.townhawllRedis === client) {
        delete globalForCache.townhawllRedis;
      }
      throw error;
    })
    .finally(() => {
      delete globalForCache.townhawllRedisConnection;
    });

  return globalForCache.townhawllRedisConnection;
}

const FIXED_WINDOW_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return {count, ttl}
`;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function takeRateLimit(input: {
  namespace: string;
  signal: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const client = await getConnectedClient();
  const signalHash = createHash("sha256").update(input.signal).digest("hex");
  const key = `rate-limit:${input.namespace}:${signalHash}`;
  const result = await client.eval(FIXED_WINDOW_SCRIPT, {
    keys: [key],
    arguments: [String(input.windowSeconds * 1_000)],
  });

  if (
    !Array.isArray(result) ||
    typeof result[0] !== "number" ||
    typeof result[1] !== "number"
  ) {
    throw new Error("Redis returned an invalid rate-limit result.");
  }

  const [count, ttlMilliseconds] = result;

  return {
    allowed: count <= input.limit,
    remaining: Math.max(0, input.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil(ttlMilliseconds / 1_000)),
  };
}
