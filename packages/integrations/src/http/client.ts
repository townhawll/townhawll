import { z } from "zod";

import { ProviderHttpError, type HttpProvider } from "./errors.js";
import { readJsonResponse } from "./response.js";
import { RequestScheduler, wait } from "./scheduler.js";

const optionsSchema = z.object({
  provider: z.enum(["TMDB", "IGDB", "STEAM", "TWITCH"]),
  baseUrl: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }),
  concurrency: z.number().int().min(1).max(16).default(2),
  maxPending: z.number().int().min(1).max(1000).default(50),
  requestsPerSecond: z.number().positive().max(100).default(4),
  timeoutMs: z.number().int().min(1).max(120_000).default(10_000),
  totalTimeoutMs: z.number().int().min(1).max(300_000).default(30_000),
  maxAttempts: z.number().int().min(1).max(5).default(3),
  baseDelayMs: z.number().int().min(1).max(60_000).default(250),
  maxDelayMs: z.number().int().min(1).max(60_000).default(5_000),
  maxResponseBytes: z
    .number()
    .int()
    .min(1)
    .max(20 * 1024 * 1024)
    .default(2 * 1024 * 1024),
});

export type ProviderHttpOptions = z.input<typeof optionsSchema>;
export type ProviderRequest = {
  path: string;
  method?: "GET" | "POST";
  headers?: HeadersInit;
  body?: string;
  signal?: AbortSignal;
  /** Only opt in for known read-only POST queries (e.g. IGDB), never mutations. */
  retryable?: boolean;
};

export function retryAfterMilliseconds(
  value: string | null,
  now = Date.now(),
): number | null {
  if (value === null || value.trim() === "") return null;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) {
    const milliseconds = Number(value) * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  // Reject numeric garbage rather than interpreting it as a historical date.
  if (!/^[A-Za-z]{3},/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

function canRetry(error: ProviderHttpError): boolean {
  return (
    error.code === "NETWORK" ||
    error.code === "TIMEOUT" ||
    (error.code === "HTTP" &&
      [408, 429, 500, 502, 503, 504].includes(error.status ?? 0))
  );
}

/** Create once per provider/credential scope, not once per request. No I/O at import time. */
export function createProviderHttpClient(
  input: ProviderHttpOptions,
  dependencies: { fetch?: typeof fetch; random?: () => number } = {},
) {
  const parsed = optionsSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid provider HTTP configuration.");
  const options = parsed.data;
  const fetchRequest = dependencies.fetch ?? globalThis.fetch;
  const random = dependencies.random ?? Math.random;
  const scheduler = new RequestScheduler(
    options.provider,
    options.concurrency,
    options.maxPending,
    1000 / options.requestsPerSecond,
  );

  async function requestJson(request: ProviderRequest): Promise<unknown> {
    let url: URL;
    try {
      url = new URL(request.path, options.baseUrl);
      if (
        url.origin !== new URL(options.baseUrl).origin ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Error();
    } catch {
      throw new ProviderHttpError(options.provider, "INVALID_REQUEST");
    }
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), options.totalTimeoutMs);
    const signal = AbortSignal.any([
      timeout.signal,
      ...(request.signal ? [request.signal] : []),
    ]);
    const retryable = request.retryable ?? (request.method ?? "GET") === "GET";
    try {
      for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
        signal.throwIfAborted();
        const release = await scheduler.acquire(signal);
        let error: ProviderHttpError;
        try {
          return await performRequest(url, request, signal);
        } catch (failure) {
          if (signal.aborted) throw failure;
          error =
            failure instanceof ProviderHttpError
              ? failure
              : new ProviderHttpError(options.provider, "NETWORK");
          if (
            error.retryAfterMs !== null &&
            (error.status === 429 || error.status === 503)
          )
            scheduler.cooldown(error.retryAfterMs);
        } finally {
          release();
        }
        if (!retryable || !canRetry(error) || attempt === options.maxAttempts)
          throw error;
        const ceiling = Math.min(
          options.maxDelayMs,
          options.baseDelayMs * 2 ** (attempt - 1),
        );
        const jitter =
          ceiling * (0.5 + Math.max(0, Math.min(1, random())) * 0.5);
        await wait(
          Math.max(error.retryAfterMs ?? 0, Math.ceil(jitter)),
          signal,
        );
      }
      throw new ProviderHttpError(options.provider, "NETWORK");
    } catch (error) {
      if (request.signal?.aborted)
        throw new ProviderHttpError(options.provider, "CANCELLED");
      if (timeout.signal.aborted)
        throw new ProviderHttpError(options.provider, "TIMEOUT");
      if (error instanceof ProviderHttpError) throw error;
      throw new ProviderHttpError(options.provider, "NETWORK");
    } finally {
      clearTimeout(timer);
    }
  }

  async function performRequest(
    url: URL,
    request: ProviderRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), options.timeoutMs);
    const attemptSignal = AbortSignal.any([signal, timeout.signal]);
    try {
      const response = await fetchRequest(url, {
        method: request.method ?? "GET",
        ...(request.headers !== undefined ? { headers: request.headers } : {}),
        ...(request.body !== undefined ? { body: request.body } : {}),
        signal: attemptSignal,
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw new ProviderHttpError(
          options.provider,
          "HTTP",
          response.status,
          retryAfterMilliseconds(response.headers.get("retry-after")),
        );
      }
      return await readJsonResponse(
        response,
        options.provider,
        options.maxResponseBytes,
        attemptSignal,
      );
    } catch (error) {
      if (timeout.signal.aborted)
        throw new ProviderHttpError(options.provider, "TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return { requestJson };
}

export type ProviderHttpClient = ReturnType<typeof createProviderHttpClient>;
export type { HttpProvider };
