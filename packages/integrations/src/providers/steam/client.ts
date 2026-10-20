import { z } from "zod";

import {
  createProviderHttpClient,
  ProviderHttpError,
  validateProviderResponse,
  type ProviderHttpOptions,
} from "../../http/index.js";
import { entrySchema, responseSchema } from "./schemas.js";

export type SteamClientOptions = {
  http?: Omit<ProviderHttpOptions, "provider" | "baseUrl">;
};
export const requestOptionsSchema = z.strictObject({
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .default("US"),
  signal: z.instanceof(AbortSignal).optional(),
});
export type SteamRequestOptions = z.input<typeof requestOptionsSchema>;
export function validateInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ProviderHttpError("STEAM", "INVALID_REQUEST");
  return result.data;
}

export function createSteamClient(
  options: SteamClientOptions,
  fetch?: typeof globalThis.fetch,
) {
  if (
    (options.http?.requestsPerSecond ?? 1) > 1 ||
    (options.http?.concurrency ?? 1) > 1 ||
    (options.http?.maxAttempts ?? 3) > 3 ||
    (options.http?.timeoutMs ?? 10_000) > 15_000 ||
    (options.http?.totalTimeoutMs ?? 30_000) > 60_000
  )
    throw new Error(
      "Steam Store requests require conservative concurrency, rate, retry and timeout limits.",
    );
  const http = createProviderHttpClient(
    {
      concurrency: 1,
      requestsPerSecond: 1,
      maxPending: 20,
      maxResponseBytes: 1024 * 1024,
      ...options.http,
      provider: "STEAM",
      baseUrl: "https://store.steampowered.com/api/",
    },
    fetch ? { fetch } : {},
  );
  async function getAppDetails(
    id: string,
    options: z.output<typeof requestOptionsSchema>,
  ) {
    // Requirements/type/ID are part of basic; individual requirement field filters are not supported.
    const params = new URLSearchParams({
      appids: id,
      cc: options.countryCode,
      l: "english",
      filters: "basic,platforms",
    });
    const data = validateProviderResponse(
      "STEAM",
      responseSchema,
      await http.requestJson({
        path: `appdetails?${params}`,
        headers: { Accept: "application/json" },
        ...(options.signal ? { signal: options.signal } : {}),
      }),
    );
    // Never fall back to an arbitrary other response entry or match by app name.
    if (!Object.hasOwn(data, id) || Object.keys(data).length !== 1)
      throw new ProviderHttpError("STEAM", "INVALID_RESPONSE");
    const entry = validateProviderResponse("STEAM", entrySchema, data[id]);
    if (!entry.success) return null;
    if (String(entry.data.steam_appid) !== id)
      throw new ProviderHttpError("STEAM", "INVALID_RESPONSE");
    return entry.data;
  }
  return { getAppDetails };
}
