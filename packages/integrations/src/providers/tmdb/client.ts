import { z } from "zod";
import type { NormalizationPolicy } from "../../normalization/ratings.js";

import { loadTmdbEnvironment } from "../../config.js";
import {
  createProviderHttpClient,
  ProviderHttpError,
  validateProviderResponse,
  type ProviderHttpOptions,
} from "../../http/index.js";

export type TmdbClientOptions = {
  normalization?: NormalizationPolicy;
  accessToken?: string;
  http?: Omit<ProviderHttpOptions, "provider" | "baseUrl">;
};

/** Trusted origin and bearer headers stay inside the provider adapter. */
export function createTmdbClient(
  options: TmdbClientOptions,
  fetch?: typeof globalThis.fetch,
) {
  const token = z
    .string()
    .trim()
    .min(1)
    .refine((value) => !/[\r\n]/.test(value))
    .safeParse(options.accessToken ?? loadTmdbEnvironment().TMDB_ACCESS_TOKEN);
  if (!token.success)
    throw new Error("Invalid TMDB access token configuration.");
  const http = createProviderHttpClient(
    {
      ...options.http,
      provider: "TMDB",
      baseUrl: "https://api.themoviedb.org/3/",
    },
    fetch ? { fetch } : {},
  );
  async function request<T>(
    path: string,
    params: URLSearchParams,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const data = await http.requestJson({
      path: `${path}?${params}`,
      headers: {
        Authorization: `Bearer ${token.data}`,
        Accept: "application/json",
      },
      ...(signal ? { signal } : {}),
    });
    return validateProviderResponse("TMDB", schema, data);
  }
  return { request };
}

export const externalIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .refine(
    (value) => /^[1-9]\d{0,9}$/.test(value) && BigInt(value) <= 2_147_483_647n,
  );
const locale = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/);
const signal = z.instanceof(AbortSignal).optional();
const year = z.number().int().min(1000).max(9999).optional();
const search = z.strictObject({
  query: z.string().trim().min(1).max(250),
  page: z.number().int().min(1).max(500).default(1),
  language: locale.default("en-US"),
  includeAdult: z.boolean().default(false),
  year,
  signal,
});
export const movieSearchInputSchema = search.extend({
  region: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  primaryReleaseYear: year,
});
export const seriesSearchInputSchema = search.extend({
  firstAirDateYear: year,
});
export const detailInputSchema = z.strictObject({
  language: locale.optional(),
  imageLanguages: z
    .array(z.union([z.literal("null"), z.string().regex(/^[a-z]{2,3}$/)]))
    .min(1)
    .max(10)
    .optional(),
  peopleLimit: z.number().int().min(0).max(10).default(0),
  signal,
});
export const personInputSchema = detailInputSchema.omit({ peopleLimit: true });
export type MovieSearchInput = z.input<typeof movieSearchInputSchema>;
export type SeriesSearchInput = z.input<typeof seriesSearchInputSchema>;
export type TmdbDetailOptions = z.input<typeof detailInputSchema>;
export type TmdbPersonOptions = z.input<typeof personInputSchema>;

export function validateInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ProviderHttpError("TMDB", "INVALID_REQUEST");
  return parsed.data;
}
export function assertResponseId(requested: string, actual: number) {
  if (String(actual) !== requested)
    throw new ProviderHttpError("TMDB", "INVALID_RESPONSE");
}
