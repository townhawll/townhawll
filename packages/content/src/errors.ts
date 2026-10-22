export const IMPORT_ERRORS = {
  VALIDATION_FAILED: "The catalogue import data is invalid.",
  EXACT_DUPLICATE:
    "This provider identity already belongs to a catalogue title.",
  POSSIBLE_DUPLICATE: "Possible duplicate titles require editorial review.",
  UNAUTHORIZED: "You do not have access to this import operation.",
  IDEMPOTENCY_CONFLICT:
    "This idempotency key was used for a different request.",
  CONCURRENT_IMPORT:
    "Another import is already active for this provider identity.",
  CONCURRENT_MODIFICATION:
    "The import operation changed. Reload before continuing.",
  INVALID_TRANSITION: "This import operation cannot enter the requested state.",
  NOT_FOUND: "The import operation is unavailable.",
  RATE_LIMITED: "Too many import requests. Please try again later.",
  PROVIDER_UNAVAILABLE: "The provider is temporarily unavailable.",
  DATABASE_UNAVAILABLE:
    "The import could not be completed. Please try again later.",
} as const;
export type ImportErrorCode = keyof typeof IMPORT_ERRORS;
export class CatalogueImportError extends Error {
  override name = "CatalogueImportError";
  readonly retryable: boolean;
  constructor(readonly code: ImportErrorCode) {
    super(IMPORT_ERRORS[code]);
    this.retryable =
      code === "PROVIDER_UNAVAILABLE" || code === "DATABASE_UNAVAILABLE";
  }
}
export function databaseErrorCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}
export function safeImportError(error: unknown): CatalogueImportError {
  if (error instanceof CatalogueImportError) return error;
  if (error instanceof Error && error.name === "ProviderHttpError")
    return new CatalogueImportError("PROVIDER_UNAVAILABLE");
  return new CatalogueImportError("DATABASE_UNAVAILABLE");
}
