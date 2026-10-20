import { z } from "zod";

import { mediaCandidateSchema, videoCandidateSchema } from "../contracts.js";
import { videoEvidenceSchema, visualSignalsSchema } from "./evidence.js";

export const selectionStateSchema = z.enum([
  "REJECTED",
  "ELIGIBLE",
  "RECOMMENDED",
]);
const factorSchema = z.strictObject({
  name: z.string(),
  points: z.number().finite(),
  explanation: z.string(),
});
const reasonSchema = z.strictObject({ code: z.string(), message: z.string() });
const assessment = {
  key: z.string(),
  state: selectionStateSchema,
  score: z.number().finite().nullable(),
  factors: z.array(factorSchema),
  reasons: z.array(reasonSchema),
  reviewReasons: z.array(z.string()),
  recommendable: z.boolean(),
  recommendationReason: z.string().nullable(),
};
export const mediaEvaluationSchema = z.strictObject({
  ...assessment,
  candidate: mediaCandidateSchema,
  purpose: z.enum(["POSTER", "HERO_ART"]),
  analysis: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  analysisMethod: z.string().nullable(),
  visualSignals: visualSignalsSchema.nullable(),
});
export const videoEvaluationSchema = z.strictObject({
  ...assessment,
  candidate: videoCandidateSchema,
  category: z.enum(["TRAILER", "TEASER", "GAMEPLAY", "OTHER"]).nullable(),
  label: z.string().nullable(),
  classificationEvidence: z.enum([
    "VERIFIED_METADATA",
    "PROVIDER",
    "INFERRED_LABEL",
    "UNKNOWN",
  ]),
  association: z.enum(["MATCH", "MISMATCH", "UNKNOWN"]),
  associationEvidence: z.enum([
    "VERIFIED_METADATA",
    "PROVIDER_LABEL",
    "PROVIDER_SCOPE",
    "NONE",
  ]),
  metadataVerified: z.boolean(),
  externalEvidence: videoEvidenceSchema.nullable(),
  uploaderVerified: z.boolean(),
  audioLanguageCode: z.string().nullable(),
  languageHint: z.string().nullable(),
  languageEvidence: z.enum([
    "EXPLICIT_AUDIO",
    "PROVIDER_HINT",
    "TITLE_CLAIM",
    "UNKNOWN",
  ]),
});
function selectionSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    recommended: item.nullable(),
    alternatives: z.array(item),
    rejected: z.array(item),
    duplicates: z.array(
      z.strictObject({ key: z.string(), duplicateOf: z.string() }),
    ),
    sourceState: z.enum([
      "KNOWN",
      "NOT_PROVIDED",
      "NOT_REQUESTED",
      "UNAVAILABLE",
      "UNSUPPORTED",
    ]),
  });
}
export const mediaSelectionSchema = selectionSchema(mediaEvaluationSchema);
export const videoSelectionSchema = selectionSchema(videoEvaluationSchema);
export const catalogueRecommendationsSchema = z.strictObject({
  poster: mediaSelectionSchema,
  hero: mediaSelectionSchema,
  video: videoSelectionSchema,
});
export type MediaEvaluation = z.infer<typeof mediaEvaluationSchema>;
export type VideoEvaluation = z.infer<typeof videoEvaluationSchema>;
export type MediaSelection = z.infer<typeof mediaSelectionSchema>;
export type VideoSelection = z.infer<typeof videoSelectionSchema>;
export type CatalogueRecommendations = z.infer<
  typeof catalogueRecommendationsSchema
>;
export type ScoreFactor = z.infer<typeof factorSchema>;
export type SelectionReason = z.infer<typeof reasonSchema>;
