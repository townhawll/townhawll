import { z } from "zod";

import { titleDetailsCandidateSchema } from "./catalogue-candidates.js";
import { candidateFieldSchema, provenanceSchema } from "./contracts.js";
import { gameDetailsCandidateSchema } from "./game-candidates.js";
import { providerIdentityKey, providerIdentitySchema } from "./identity.js";

const text = z.string().trim().min(1).max(65_536);
const nullableText = text.nullable();
const megabytes = z.number().int().positive().max(2_147_483_647).nullable();
export const systemPlatformSchema = z.enum(["WINDOWS", "MACOS", "LINUX"]);
export const requirementTierSchema = z.enum(["MINIMUM", "RECOMMENDED"]);

/** Plain-text fields align with GameSystemRequirement; source HTML is evidence only. */
export const gameSystemRequirementCandidateSchema = z.strictObject({
  platform: systemPlatformSchema,
  tier: requirementTierSchema,
  os: nullableText,
  cpu: nullableText,
  gpu: nullableText,
  ramMb: megabytes,
  storageMb: megabytes,
  directX: nullableText,
  additionalNotes: nullableText,
  rawText: text,
  originalText: z.string().min(1).max(65_536),
  source: text,
  provenance: provenanceSchema,
});

export const gameSupplementCandidateSchema = z
  .strictObject({
    identity: providerIdentitySchema.refine(
      (identity) => identity.entity === "game" || identity.entity === "app",
    ),
    name: candidateFieldSchema(text),
    appType: z.enum(["GAME", "DLC", "DEMO", "OTHER"]),
    sourceAppType: text,
    requestedCountryCode: z.string().regex(/^[A-Z]{2}$/),
    requestedLanguageCode: z.string().regex(/^[a-z]{2,3}$/),
    platformSupport: z
      .array(
        z.strictObject({
          platform: systemPlatformSchema,
          supported: candidateFieldSchema(z.boolean()),
        }),
      )
      .length(3),
    systemRequirements: candidateFieldSchema(
      z.array(gameSystemRequirementCandidateSchema).max(6),
    ),
    provenance: provenanceSchema,
    issues: titleDetailsCandidateSchema.shape.issues,
  })
  .superRefine((value, ctx) => {
    if (
      providerIdentityKey(value.identity) !==
      providerIdentityKey(value.provenance.identity)
    )
      ctx.addIssue({
        code: "custom",
        message: "Supplement provenance must identify the source app.",
      });
    const platforms = value.platformSupport.map((entry) => entry.platform);
    if (new Set(platforms).size !== platforms.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate platform support entry.",
      });
    if (value.systemRequirements.state === "known") {
      if (
        value.systemRequirements.value.some(
          (row) =>
            providerIdentityKey(row.provenance.identity) !==
            providerIdentityKey(value.identity),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Requirement provenance must identify the source app.",
        });
      const rows = value.systemRequirements.value.map(
        (row) => `${row.platform}:${row.tier}`,
      );
      if (new Set(rows).size !== rows.length)
        ctx.addIssue({
          code: "custom",
          message: "Duplicate requirement platform/tier.",
        });
    }
  });

/** Supplements never replace the candidate's canonical metadata or provider mappings. */
export const gameEnrichmentResultSchema = z.strictObject({
  candidate: gameDetailsCandidateSchema,
  supplementary: candidateFieldSchema(gameSupplementCandidateSchema),
  issues: titleDetailsCandidateSchema.shape.issues,
});

export type GameSystemRequirementCandidate = z.infer<
  typeof gameSystemRequirementCandidateSchema
>;
export type GameSupplementCandidate = z.infer<
  typeof gameSupplementCandidateSchema
>;
export type GameEnrichmentResult = z.infer<typeof gameEnrichmentResultSchema>;
export type SystemPlatform = z.infer<typeof systemPlatformSchema>;
export type RequirementTier = z.infer<typeof requirementTierSchema>;
