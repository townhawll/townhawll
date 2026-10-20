export type HttpProvider = "TMDB" | "IGDB" | "STEAM" | "TWITCH";
export type ProviderErrorCode =
  | "HTTP"
  | "NETWORK"
  | "TIMEOUT"
  | "CANCELLED"
  | "INVALID_JSON"
  | "INVALID_RESPONSE"
  | "RESPONSE_TOO_LARGE"
  | "QUEUE_FULL"
  | "INVALID_REQUEST";

/** Deliberately excludes URLs, headers, bodies and underlying fetch/Zod errors. */
export class ProviderHttpError extends Error {
  constructor(
    readonly provider: HttpProvider,
    readonly code: ProviderErrorCode,
    readonly status: number | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(
      `Provider ${provider} request failed (${code}${status === null ? "" : `: ${status}`}).`,
    );
    this.name = "ProviderHttpError";
  }
}
