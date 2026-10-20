import { z } from "zod";

import { providerIdentitySchema } from "./identity.js";

const text = z.string().trim().min(1);
const count = z.number().int().nonnegative();
const minutes = z.number().int().positive();
const language = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
const country = z.string().regex(/^[A-Z]{2}$/);
export const sourceUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    ![...url.searchParams.keys()].some((key) =>
      /token|secret|api.?key|authorization/i.test(key),
    )
  );
}, "Expected a public HTTPS source URL without credentials.");

export const provenanceSchema = z.strictObject({
  identity: providerIdentitySchema,
  fetchedAt: z.iso.datetime({ offset: true }),
  sourceUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
  sourceUrl: sourceUrlSchema.nullable(),
});

/** Missing data is not an empty list/false/zero; failed sections must remain distinguishable. */
export function candidateFieldSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion("state", [
    z
      .strictObject({
        state: z.literal("known"),
        value,
        certainty: z.enum(["PROVIDED", "INFERRED"]),
        evidence: z.array(text).max(30),
        provenance: provenanceSchema,
      })
      .refine(
        (field) => field.certainty !== "INFERRED" || field.evidence.length > 0,
        "Inferred values require evidence.",
      ),
    z.strictObject({
      state: z.literal("missing"),
      reason: z.enum([
        "NOT_PROVIDED",
        "NOT_REQUESTED",
        "UNAVAILABLE",
        "UNSUPPORTED",
      ]),
    }),
  ]);
}

export const calendarDateSchema = z.iso.date();
export const releaseDateSchema = z.discriminatedUnion("precision", [
  z.strictObject({ precision: z.literal("DAY"), date: calendarDateSchema }),
  z.strictObject({
    precision: z.literal("MONTH"),
    year: z.number().int().min(1).max(9999),
    month: z.number().int().min(1).max(12),
  }),
  z.strictObject({
    precision: z.literal("YEAR"),
    year: z.number().int().min(1).max(9999),
  }),
  z.strictObject({
    precision: z.literal("QUARTER"),
    year: z.number().int().min(1).max(9999),
    quarter: z.number().int().min(1).max(4),
  }),
]);

export const certificationSchema = z.strictObject({
  // Raw evidence includes blank/unrated provider values; selection interprets it separately.
  certification: z.string(),
  system: text.nullable(),
  country: country.nullable(),
  provenance: provenanceSchema,
  releaseType: count.nullable().optional(),
  sourceReleaseDate: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  languageCode: language.nullable().optional(),
});

export const ageRatingSelectionSchema = z.strictObject({
  normalizedAgeRating: z.enum(["All ages", "7+", "13+", "16+", "18+"]),
  effectiveCertification: text,
  effectiveCertificationSystem: text,
  effectiveCertificationCountry: country.nullable(),
});

const mediaOwnerSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("TITLE"),
      identity: providerIdentitySchema,
    }),
    z.strictObject({
      kind: z.literal("SEASON"),
      identity: providerIdentitySchema,
    }),
    z.strictObject({
      kind: z.literal("PERSON"),
      identity: providerIdentitySchema,
    }),
  ])
  .superRefine((value, ctx) => {
    const entity = value.identity.entity;
    if (
      (value.kind === "TITLE" &&
        !["movie", "series", "game", "app"].includes(entity)) ||
      (value.kind === "SEASON" && entity !== "season") ||
      (value.kind === "PERSON" && entity !== "person")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Media owner identity does not match its kind.",
      });
    }
  });

/** Source references only. No selection, object key, transformation or activation state. */
export const mediaCandidateSchema = z
  .strictObject({
    owner: mediaOwnerSchema,
    // Null means selection has not assigned a persistent media purpose yet.
    purpose: z.enum(["POSTER", "HERO_ART", "PERSON_IMAGE", "LOGO"]).nullable(),
    sourceType: z.enum([
      "POSTER",
      "BACKDROP",
      "ARTWORK",
      "COVER",
      "PROFILE",
      "LOGO",
      "SCREENSHOT",
    ]),
    providerAssetId: text.nullable(),
    providerRecordId: text.nullable().optional(),
    sourceUrl: sourceUrlSchema,
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    languageCode: language.nullable(),
    provenance: provenanceSchema,
    providerPrimary: z.boolean().optional(),
    providerVoteAverage: z.number().finite().nullable().optional(),
    providerVoteCount: count.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const allowed =
      value.owner.kind === "PERSON"
        ? ["PERSON_IMAGE"]
        : value.owner.kind === "SEASON"
          ? ["POSTER"]
          : ["POSTER", "HERO_ART", "LOGO"];
    if (
      value.purpose === null
        ? value.owner.kind !== "TITLE"
        : !allowed.includes(value.purpose)
    )
      ctx.addIssue({
        code: "custom",
        message: "Media purpose is not supported for this owner.",
      });
  });

export const videoCandidateSchema = z.strictObject({
  platform: text,
  externalKey: text,
  providerVideoId: text.nullable(),
  type: candidateFieldSchema(
    z.enum(["TRAILER", "TEASER", "GAMEPLAY", "OTHER"]),
  ),
  name: text.nullable(),
  official: candidateFieldSchema(z.boolean()),
  languageCode: candidateFieldSchema(language),
  provenance: provenanceSchema,
  sourceType: text.nullable().optional(),
  providerLanguageCode: language.nullable().optional(),
  regionCode: country.nullable().optional(),
  publishedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  resolution: z.number().int().positive().nullable().optional(),
});

export const aliasCandidateSchema = z.strictObject({
  name: text,
  normalizedKey: text,
  languageCode: language.nullable(),
  provenance: provenanceSchema,
  countryCode: country.nullable().optional(),
  sourceType: z.string().nullable().optional(),
  sourceVariants: z
    .array(
      z.strictObject({
        name: text,
        languageCode: language.nullable(),
        countryCode: country.nullable(),
        sourceType: z.string().nullable(),
      }),
    )
    .optional(),
});

const movieSchema = z.strictObject({
  status: z.enum([
    "PLANNED",
    "IN_PRODUCTION",
    "POST_PRODUCTION",
    "RELEASED",
    "CANCELED",
    "UNKNOWN",
  ]),
  runtimeMinutes: candidateFieldSchema(minutes),
  originalLanguageCode: candidateFieldSchema(language),
  dubbedLanguageCodes: candidateFieldSchema(z.array(language)),
  productionCountryCodes: candidateFieldSchema(z.array(country)),
});
const seriesSchema = z.strictObject({
  status: z.enum([
    "RETURNING",
    "ENDED",
    "CANCELED",
    "IN_PRODUCTION",
    "PLANNED",
    "UNKNOWN",
  ]),
  lastAirDate: candidateFieldSchema(calendarDateSchema),
  averageEpisodeRuntime: candidateFieldSchema(minutes),
  numberOfSeasons: candidateFieldSchema(count),
  numberOfEpisodes: candidateFieldSchema(count),
  originalLanguageCode: candidateFieldSchema(language),
  dubbedLanguageCodes: candidateFieldSchema(z.array(language)),
  originCountryCodes: candidateFieldSchema(z.array(country)),
});
const gameSchema = z.strictObject({
  releaseStatus: z.enum([
    "RELEASED",
    "UPCOMING",
    "DELAYED",
    "CANCELLED",
    "EARLY_ACCESS",
    "UNKNOWN",
  ]),
  gameType: z.enum([
    "MAIN_GAME",
    "DLC",
    "EXPANSION",
    "STANDALONE_EXPANSION",
    "REMAKE",
    "REMASTER",
    "EDITION",
    "BUNDLE",
    "OTHER",
  ]),
  primaryLanguageCode: candidateFieldSchema(language),
  modes: candidateFieldSchema(
    z.array(
      z.enum(["SINGLE_PLAYER", "MULTIPLAYER", "CO_OP", "MMO", "SPLIT_SCREEN"]),
    ),
  ),
});

const titleBase = z.strictObject({
  identity: providerIdentitySchema,
  mappings: z.array(provenanceSchema).min(1).max(30),
  title: text,
  originalTitle: candidateFieldSchema(text),
  overview: candidateFieldSchema(text),
  primaryReleaseDate: candidateFieldSchema(releaseDateSchema),
  isAnime: candidateFieldSchema(z.boolean()),
  aliases: candidateFieldSchema(z.array(aliasCandidateSchema)),
  certifications: candidateFieldSchema(z.array(certificationSchema)),
  ageRating: candidateFieldSchema(ageRatingSelectionSchema).optional(),
  media: candidateFieldSchema(z.array(mediaCandidateSchema)),
  videos: candidateFieldSchema(z.array(videoCandidateSchema)),
});

/** Review candidate, never a Prisma input or a record ready for automatic publication. */
export const titleCandidateSchema = z
  .discriminatedUnion("type", [
    titleBase.extend({ type: z.literal("MOVIE"), metadata: movieSchema }),
    titleBase.extend({ type: z.literal("SERIES"), metadata: seriesSchema }),
    titleBase.extend({ type: z.literal("GAME"), metadata: gameSchema }),
  ])
  .superRefine((value, ctx) => {
    const entity = value.identity.entity;
    if (
      (value.type === "MOVIE" && entity !== "movie") ||
      (value.type === "SERIES" && entity !== "series") ||
      (value.type === "GAME" && entity !== "game" && entity !== "app")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Title type does not match the provider identity.",
      });
    }
    if (
      !value.mappings.some(
        (mapping) =>
          mapping.identity.provider === value.identity.provider &&
          mapping.identity.entity === entity &&
          mapping.identity.id === value.identity.id,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Primary identity must be included in mappings.",
      });
    }
    const mappingKeys = new Set<string>();
    for (const mapping of value.mappings) {
      const mappingEntity = mapping.identity.entity;
      const key = `${mapping.identity.provider}:${mappingEntity}:${mapping.identity.id}`;
      if (mappingKeys.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: "Duplicate provider mapping.",
        });
      }
      mappingKeys.add(key);
      if (
        (value.type === "MOVIE" && mappingEntity !== "movie") ||
        (value.type === "SERIES" && mappingEntity !== "series") ||
        (value.type === "GAME" &&
          mappingEntity !== "game" &&
          mappingEntity !== "app")
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Mapping does not identify this title type.",
        });
      }
    }
  });

export type Provenance = z.infer<typeof provenanceSchema>;
export type MediaCandidate = z.infer<typeof mediaCandidateSchema>;
export type VideoCandidate = z.infer<typeof videoCandidateSchema>;
export type TitleCandidate = z.infer<typeof titleCandidateSchema>;
export type CandidateField<T> =
  | {
      state: "known";
      value: T;
      certainty: "PROVIDED" | "INFERRED";
      evidence: string[];
      provenance: Provenance;
    }
  | {
      state: "missing";
      reason: "NOT_PROVIDED" | "NOT_REQUESTED" | "UNAVAILABLE" | "UNSUPPORTED";
    };
