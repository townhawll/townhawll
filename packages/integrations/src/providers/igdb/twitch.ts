import { z } from "zod";

import {
  createProviderHttpClient,
  ProviderHttpError,
  validateProviderResponse,
} from "../../http/index.js";

const tokenSchema = z.object({
  access_token: z
    .string()
    .min(1)
    .max(4096)
    .refine((value) => !/[\s\p{Cc}]/u.test(value)),
  expires_in: z.number().int().positive().max(31_536_000),
  token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
});

/** Cancelling one consumer must not cancel a refresh shared by other requests. */
function cancellable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted)
    return Promise.reject(new ProviderHttpError("TWITCH", "CANCELLED"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new ProviderHttpError("TWITCH", "CANCELLED"));
    signal.addEventListener("abort", abort, { once: true });
    void promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

export function createTwitchTokenProvider(
  credentials: { clientId: string; clientSecret: string },
  dependencies: { fetch?: typeof globalThis.fetch; now?: () => number } = {},
) {
  const clock = dependencies.now ?? Date.now;
  const http = createProviderHttpClient(
    {
      provider: "TWITCH",
      baseUrl: "https://id.twitch.tv/oauth2/",
      concurrency: 1,
      requestsPerSecond: 1,
      maxAttempts: 1,
      maxResponseBytes: 16 * 1024,
    },
    dependencies.fetch ? { fetch: dependencies.fetch } : {},
  );
  let cached: { value: string; refreshAt: number } | null = null;
  let refreshing: Promise<string> | null = null;

  async function acquire(): Promise<string> {
    const startedAt = clock();
    const data = validateProviderResponse(
      "TWITCH",
      tokenSchema,
      await http.requestJson({
        path: "token",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          grant_type: "client_credentials",
        }).toString(),
        // Token minting is not a read-only query; do not replay it automatically.
        retryable: false,
      }),
    );
    const lifetime = data.expires_in * 1000;
    cached = {
      value: data.access_token,
      refreshAt: startedAt + lifetime - Math.min(60_000, lifetime / 10),
    };
    return cached.value;
  }
  function get(signal?: AbortSignal): Promise<string> {
    if (signal?.aborted)
      return Promise.reject(new ProviderHttpError("TWITCH", "CANCELLED"));
    if (cached && clock() < cached.refreshAt)
      return Promise.resolve(cached.value);
    refreshing ??= acquire().finally(() => {
      refreshing = null;
    });
    return cancellable(refreshing, signal);
  }
  function invalidate(valueUsed: string) {
    // A late 401 from an older request must not evict a newly refreshed token.
    if (cached?.value === valueUsed) cached = null;
  }
  return { get, invalidate };
}
