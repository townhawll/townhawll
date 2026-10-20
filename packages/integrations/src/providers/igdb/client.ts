import { z } from "zod";
import type { NormalizationPolicy } from "../../normalization/ratings.js";

import { loadIgdbEnvironment } from "../../config.js";
import {
  createProviderHttpClient,
  ProviderHttpError,
  validateProviderResponse,
  type ProviderHttpOptions,
} from "../../http/index.js";
import { createTwitchTokenProvider } from "./twitch.js";

export type IgdbClientOptions = {
  normalization?: NormalizationPolicy;
  credentials?: { clientId: string; clientSecret: string };
  http?: Omit<ProviderHttpOptions, "provider" | "baseUrl">;
};
const secret = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((value) => !/[\s\p{Cc}]/u.test(value));
const credentialsSchema = z.strictObject({
  clientId: secret,
  clientSecret: secret,
});

export function createIgdbClient(
  options: IgdbClientOptions,
  dependencies: { fetch?: typeof globalThis.fetch; now?: () => number },
) {
  const environment = options.credentials ? null : loadIgdbEnvironment();
  const credentials = credentialsSchema.safeParse(
    options.credentials ?? {
      clientId: environment?.IGDB_CLIENT_ID,
      clientSecret: environment?.IGDB_CLIENT_SECRET,
    },
  );
  if (!credentials.success)
    throw new Error("Invalid IGDB credential configuration.");
  const credential = credentials.data;
  if (
    (options.http?.concurrency ?? 2) > 8 ||
    (options.http?.requestsPerSecond ?? 4) > 4
  )
    throw new Error(
      "IGDB permits at most four requests per second and eight concurrent requests.",
    );
  const tokens = createTwitchTokenProvider(credential, dependencies);
  const http = createProviderHttpClient(
    { ...options.http, provider: "IGDB", baseUrl: "https://api.igdb.com/v4/" },
    dependencies.fetch ? { fetch: dependencies.fetch } : {},
  );

  async function request<T>(
    endpoint: "games" | "game_time_to_beats",
    body: string,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await tokens.get(signal);
      try {
        const data = await http.requestJson({
          path: endpoint,
          method: "POST",
          body,
          signal,
          retryable: true,
          headers: {
            "Client-ID": credential.clientId,
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "text/plain",
          },
        });
        return validateProviderResponse("IGDB", schema, data);
      } catch (error) {
        if (!(error instanceof ProviderHttpError) || error.status !== 401)
          throw error;
        tokens.invalidate(token);
        if (attempt === 1) throw error;
      }
    }
    throw new ProviderHttpError("IGDB", "HTTP", 401);
  }
  return { request };
}
