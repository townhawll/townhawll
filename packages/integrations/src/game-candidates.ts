import { z } from "zod";

import { titleDetailsCandidateSchema } from "./catalogue-candidates.js";
import {
  candidateFieldSchema,
  provenanceSchema,
  releaseDateSchema,
  titleCandidateSchema,
} from "./contracts.js";
import { providerIdentityKey, providerIdentitySchema } from "./identity.js";

const text = z.string().trim().min(1);
const count = z.number().int().nonnegative().safe();
const gameIdentity = providerIdentitySchema.refine(
  (identity) => identity.entity === "game" || identity.entity === "app",
);
const platformIdentity = providerIdentitySchema.refine(
  (identity) => identity.entity === "platform",
);
const gameTitle = titleCandidateSchema.refine((title) => title.type === "GAME");

export const gameReleaseCandidateSchema = z.strictObject({
  providerRecordId: text,
  platformIdentity: platformIdentity.nullable(),
  date: candidateFieldSchema(releaseDateSchema),
  sourceTimestamp: count.nullable(),
  sourceDateFormat: text.nullable(),
  sourceComponents: z.strictObject({
    year: count.nullable(),
    month: count.nullable(),
    day: count.nullable(),
  }),
  sourceLabel: text.nullable(),
  region: text.nullable(),
  status: text.nullable(),
  provenance: provenanceSchema,
});
export const gameRelationshipCandidateSchema = z
  .strictObject({
    sourceIdentity: gameIdentity,
    targetIdentity: gameIdentity,
    type: z.enum([
      "DLC",
      "EXPANSION",
      "STANDALONE_EXPANSION",
      "EDITION",
      "REMAKE",
      "REMASTER",
      "SEQUEL",
      "PREQUEL",
      "SPIN_OFF",
      "REBOOT",
      "ADAPTATION",
      "RELATED",
    ]),
    sourceField: text,
    relatedName: candidateFieldSchema(text),
    provenance: provenanceSchema,
  })
  .refine(
    (relation) =>
      providerIdentityKey(relation.sourceIdentity) !==
      providerIdentityKey(relation.targetIdentity),
    "Self relationships are not supported.",
  );

/** Keep original seconds and sample size alongside the converted minute values. */
export const gameCompletionCandidateSchema = z.strictObject({
  rushedSeconds: candidateFieldSchema(count),
  normalSeconds: candidateFieldSchema(count),
  completionistSeconds: candidateFieldSchema(count),
  sampleCount: candidateFieldSchema(count),
  mainStoryMinutes: candidateFieldSchema(z.number().int().positive()),
  mainPlusExtraMinutes: candidateFieldSchema(z.number().int().positive()),
  completionistMinutes: candidateFieldSchema(z.number().int().positive()),
  provenance: provenanceSchema,
});
export const gameDetailsCandidateSchema = titleDetailsCandidateSchema.extend({
  title: gameTitle,
  game: z.strictObject({
    sourceGameType: candidateFieldSchema(text),
    sourceStoryline: candidateFieldSchema(text),
    firstReleaseTimestamp: candidateFieldSchema(count),
    releaseStatus: candidateFieldSchema(
      z.enum([
        "RELEASED",
        "UPCOMING",
        "DELAYED",
        "CANCELLED",
        "EARLY_ACCESS",
        "UNKNOWN",
      ]),
    ),
    sourceGameModes: candidateFieldSchema(
      z.array(z.strictObject({ id: text, name: text.nullable() })),
    ),
    themes: candidateFieldSchema(
      z.array(
        z.strictObject({
          identity: providerIdentitySchema.refine(
            (identity) => identity.entity === "theme",
          ),
          name: text,
          provenance: provenanceSchema,
        }),
      ),
    ),
    platforms: candidateFieldSchema(
      z.array(
        z.strictObject({
          identity: platformIdentity,
          name: candidateFieldSchema(text),
          abbreviation: candidateFieldSchema(text),
          releases: z.array(gameReleaseCandidateSchema),
          provenance: provenanceSchema,
        }),
      ),
    ),
    releaseEvents: candidateFieldSchema(z.array(gameReleaseCandidateSchema)),
    relationships: candidateFieldSchema(
      z.array(gameRelationshipCandidateSchema),
    ),
    sourceRatings: candidateFieldSchema(
      z.array(
        z.strictObject({
          providerRecordId: text,
          organization: candidateFieldSchema(text),
          rating: candidateFieldSchema(text),
          recognized: z.boolean(),
          provenance: provenanceSchema,
        }),
      ),
    ),
    completionTime: candidateFieldSchema(gameCompletionCandidateSchema),
    confirmedSteamIdentities: candidateFieldSchema(
      z.array(
        providerIdentitySchema.refine(
          (identity) =>
            identity.provider === "STEAM" && identity.entity === "app",
        ),
      ),
    ),
    // Preserve IDs even when an expanded provider reference has no usable name.
    unresolvedReferences: z.array(
      z.strictObject({ identity: providerIdentitySchema, sourceField: text }),
    ),
  }),
});
export const gameSearchPageSchema = z.strictObject({
  offset: count,
  limit: z.number().int().min(1).max(50),
  nextOffset: count.nullable(),
  results: z.array(gameTitle),
});

export type GameDetailsCandidate = z.infer<typeof gameDetailsCandidateSchema>;
export type GameReleaseCandidate = z.infer<typeof gameReleaseCandidateSchema>;
export type GameRelationshipCandidate = z.infer<
  typeof gameRelationshipCandidateSchema
>;
export type GameSearchPage = z.infer<typeof gameSearchPageSchema>;
