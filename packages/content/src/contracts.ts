import { providerIdentitySchema } from "@townhawll/integrations/identity";
import { z } from "zod";

export const importStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);
export type ImportStatus = z.infer<typeof importStatusSchema>;
export const canonicalIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const importIdentitySchema = providerIdentitySchema.refine(
  (value) =>
    (value.provider === "TMDB" && ["movie", "series"].includes(value.entity)) ||
    (value.provider === "IGDB" && value.entity === "game"),
);
export const importContextSchema = z.strictObject({
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
});
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);
export const transitionInputSchema = z.strictObject({
  operationId: canonicalIdSchema,
  expectedVersion: z.number().int().nonnegative(),
  status: importStatusSchema,
  resultTitleId: canonicalIdSchema.optional(),
  failureCode: z
    .enum([
      "VALIDATION_FAILED",
      "EXACT_DUPLICATE",
      "PROVIDER_UNAVAILABLE",
      "DATABASE_UNAVAILABLE",
    ])
    .optional(),
});
export type ImportTransitionInput = z.infer<typeof transitionInputSchema>;
export interface DuplicateEvidence {
  kind:
    | "PROVIDER_MAPPING"
    | "TITLE_NAME"
    | "ALIAS"
    | "RELEASE_DAY"
    | "RELEASE_YEAR";
  value: string;
}
export interface DuplicateMatch {
  titleId: string;
  title: string;
  type: "MOVIE" | "SERIES" | "GAME";
  deleted: boolean;
  evidence: DuplicateEvidence[];
}
export interface DuplicateCheckResult {
  exact: DuplicateMatch[];
  possible: DuplicateMatch[];
  truncated: boolean;
}
export interface ImportValidationIssue {
  code: string;
  path: string;
}
export * from "./errors.ts";
