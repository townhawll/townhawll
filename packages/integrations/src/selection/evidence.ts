import { z } from "zod";

import {
  sourceUrlSchema,
  type MediaCandidate,
  type VideoCandidate,
} from "../contracts.js";
import { providerIdentityKey } from "../identity.js";
import { normalizeLanguageCode } from "../normalization/text.js";

const unit = z.number().finite().min(0).max(1);
/** Optional externally measured signals. These are heuristics, not OCR or semantic understanding. */
export const visualSignalsSchema = z.strictObject({
  // Explicit visual assessment only; image geometry cannot establish scene content.
  composition: z
    .enum([
      "SCENE",
      "PROMOTIONAL_PORTRAIT",
      "PROMOTIONAL_KEY_ART",
      "LOGO_CARD",
      "UNKNOWN",
    ])
    .optional(),
  broken: z.boolean().optional(),
  averageBrightness: unit.optional(),
  dynamicRange: unit.optional(),
  detailSpread: unit.optional(),
  focalRightBias: unit.optional(),
  emptySpace: unit.optional(),
  overlayComplexity: unit.optional(),
  overlayBrightness: unit.optional(),
  saturation: unit.optional(),
  textLikelihood: unit.optional(),
  cornerTextLikelihood: unit.optional(),
  hudLikelihood: unit.optional(),
  letterboxLikelihood: unit.optional(),
  coverSimilarity: unit.optional(),
});
export const mediaEvidenceSchema = z.strictObject({
  key: z.string().min(1).max(4096),
  method: z.string().trim().min(1).max(100),
  signals: visualSignalsSchema,
});
export const videoEvidenceSchema = z.strictObject({
  key: z.string().min(1).max(4096),
  source: z.enum(["YOUTUBE_DATA_API", "OEMBED", "PROVIDER_API"]),
  referenceUrl: sourceUrlSchema,
  checkedAt: z.iso.datetime({ offset: true }),
  title: z.string().trim().min(1).max(2000).nullable(),
  channelId: z.string().min(1).max(128).nullable().optional(),
  availability: z.enum(["AVAILABLE", "UNAVAILABLE", "UNKNOWN"]),
  // oEmbed iframe sizes are not native video dimensions or proof of duration/audio.
  durationSeconds: z.number().finite().positive().nullable().optional(),
  nativeWidth: z.number().int().positive().nullable().optional(),
  nativeHeight: z.number().int().positive().nullable().optional(),
  embeddable: z.boolean().nullable().optional(),
  isShort: z.boolean().nullable().optional(),
  audioLanguageCode: z.string().nullable().optional(),
});
const language = z
  .string()
  .transform(normalizeLanguageCode)
  .refine((value) => value !== null);
export const selectionPolicySchema = z.strictObject({
  preferredLanguages: z.array(language).max(10).optional(),
  trustedYoutubeChannelIds: z
    .array(z.string().regex(/^UC[A-Za-z0-9_-]{22}$/))
    .max(100)
    .optional(),
});
export type SelectionPolicy = z.input<typeof selectionPolicySchema>;
export type VisualSignals = z.infer<typeof visualSignalsSchema>;
export type MediaEvidence = z.infer<typeof mediaEvidenceSchema>;
export type VideoEvidence = z.infer<typeof videoEvidenceSchema>;
export type SelectionEvidence = z.infer<typeof evidenceSchema>;
const evidenceSchema = z.strictObject({
  media: z.array(mediaEvidenceSchema).max(24).optional(),
  videos: z.array(videoEvidenceSchema).max(100).optional(),
});

export function validateSelectionPolicy(
  value: unknown = {},
): z.output<typeof selectionPolicySchema> {
  const result = selectionPolicySchema.safeParse(value);
  if (!result.success) throw new Error("Invalid catalogue selection policy.");
  return result.data;
}
export function validateSelectionEvidence(
  value: unknown = {},
): SelectionEvidence {
  const result = evidenceSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "Invalid catalogue selection evidence or evidence budget exceeded.",
    );
  for (const values of [result.data.media ?? [], result.data.videos ?? []]) {
    if (new Set(values.map((entry) => entry.key)).size !== values.length)
      throw new Error("Duplicate catalogue selection evidence key.");
  }
  return result.data;
}
export function mediaCandidateKey(candidate: MediaCandidate): string {
  return JSON.stringify([
    providerIdentityKey(candidate.owner.identity),
    candidate.provenance.identity.provider,
    candidate.providerAssetId,
    candidate.sourceUrl,
  ]);
}
export function videoCandidateKey(
  candidate: Pick<VideoCandidate, "platform" | "externalKey">,
): string {
  const name = candidate.platform.trim().toLowerCase();
  return `${name === "youtube" ? "YouTube" : name === "vimeo" ? "Vimeo" : name}:${candidate.externalKey}`;
}
