import { z } from "zod";

import {
  calendarDateSchema,
  candidateFieldSchema,
  mediaCandidateSchema,
  provenanceSchema,
  releaseDateSchema,
  sourceUrlSchema,
  titleCandidateSchema,
} from "./contracts.js";
import { providerIdentitySchema } from "./identity.js";
import { catalogueRecommendationsSchema } from "./selection/contracts.js";

const text = z.string().trim().min(1);
const count = z.number().int().nonnegative();
const country = z.string().regex(/^[A-Z]{2}$/);
const language = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
const personIdentity = providerIdentitySchema.refine(
  (identity) => identity.entity === "person",
);

export const personCandidateSchema = z.strictObject({
  identity: personIdentity,
  name: text,
  originalName: candidateFieldSchema(text),
  biography: candidateFieldSchema(text),
  birthday: candidateFieldSchema(calendarDateSchema),
  deathday: candidateFieldSchema(calendarDateSchema),
  placeOfBirth: candidateFieldSchema(text),
  media: candidateFieldSchema(z.array(mediaCandidateSchema)),
  detailStatus: z.enum(["NOT_REQUESTED", "AVAILABLE", "UNAVAILABLE"]),
  provenance: provenanceSchema,
});

export const creditCandidateSchema = z.strictObject({
  personIdentity,
  type: z.enum(["CAST", "CREW", "CREATOR"]),
  characterName: text.nullable(),
  job: text.nullable(),
  department: text.nullable(),
  displayOrder: count.nullable(),
  providerCreditId: text.nullable(),
  episodeCount: count.nullable(),
  provenance: provenanceSchema,
});

const taxonomySchema = z.strictObject({
  identity: providerIdentitySchema.refine((identity) =>
    ["genre", "keyword", "theme"].includes(identity.entity),
  ),
  name: text,
  provenance: provenanceSchema,
});
const companySchema = z.strictObject({
  identity: providerIdentitySchema.refine((identity) =>
    ["company", "network"].includes(identity.entity),
  ),
  name: text,
  role: z.enum([
    "PRODUCTION_COMPANY",
    "NETWORK",
    "STUDIO",
    "DEVELOPER",
    "PUBLISHER",
  ]),
  countryCode: country.nullable(),
  logoUrl: sourceUrlSchema.nullable(),
  provenance: provenanceSchema,
});
const franchiseSchema = z.strictObject({
  identity: providerIdentitySchema.refine((identity) =>
    ["collection", "franchise"].includes(identity.entity),
  ),
  name: text,
  provenance: provenanceSchema,
});
export const seasonCandidateSchema = z.strictObject({
  identity: providerIdentitySchema.refine(
    (identity) => identity.entity === "season",
  ),
  seriesIdentity: providerIdentitySchema.refine(
    (identity) => identity.entity === "series",
  ),
  seasonNumber: count,
  name: text.nullable(),
  airDate: candidateFieldSchema(calendarDateSchema),
  episodeCount: candidateFieldSchema(count),
  media: candidateFieldSchema(z.array(mediaCandidateSchema)),
  provenance: provenanceSchema,
});
const watchAvailabilitySchema = z.strictObject({
  identity: providerIdentitySchema.refine(
    (identity) => identity.entity === "watch_provider",
  ),
  name: text,
  regionCode: country,
  accessType: z.enum(["SUBSCRIPTION", "FREE", "ADS", "RENT", "BUY"]),
  sourceUrl: sourceUrlSchema.nullable(),
  logoUrl: sourceUrlSchema.nullable(),
  displayPriority: count.nullable(),
  attribution: z.literal("JustWatch"),
  provenance: provenanceSchema,
});

/** Related references remain candidates; no placeholder TownHawll records are created. */
export const titleDetailsCandidateSchema = z.strictObject({
  title: titleCandidateSchema,
  recommendations: catalogueRecommendationsSchema.optional(),
  genres: candidateFieldSchema(z.array(taxonomySchema)),
  keywords: candidateFieldSchema(z.array(taxonomySchema)),
  credits: candidateFieldSchema(z.array(creditCandidateSchema)),
  people: z.array(personCandidateSchema),
  companies: candidateFieldSchema(z.array(companySchema)),
  franchises: candidateFieldSchema(z.array(franchiseSchema)),
  seasons: candidateFieldSchema(z.array(seasonCandidateSchema)),
  watchProviders: candidateFieldSchema(z.array(watchAvailabilitySchema)),
  sourceStatus: candidateFieldSchema(text),
  sourceSpokenLanguageCodes: candidateFieldSchema(z.array(language)),
  sourceEpisodeRuntimes: candidateFieldSchema(z.array(count)),
  providerPopularity: candidateFieldSchema(z.number().finite().nonnegative()),
  issues: z.array(
    z.strictObject({
      section: text,
      code: z.enum([
        "MISSING_SECTION",
        "INVALID_RESPONSE",
        "HTTP",
        "NETWORK",
        "TIMEOUT",
        "RESPONSE_TOO_LARGE",
        "INVALID_JSON",
        "QUEUE_FULL",
      ]),
      identity: providerIdentitySchema,
    }),
  ),
});

export const titleSearchPageSchema = z.strictObject({
  page: z.number().int().positive(),
  totalPages: count,
  totalResults: count,
  results: z.array(
    z.strictObject({
      identity: providerIdentitySchema,
      type: z.enum(["MOVIE", "SERIES"]),
      title: text,
      originalTitle: candidateFieldSchema(text),
      overview: candidateFieldSchema(text),
      primaryReleaseDate: candidateFieldSchema(releaseDateSchema),
      originalLanguageCode: candidateFieldSchema(language),
      media: z.array(mediaCandidateSchema),
      provenance: provenanceSchema,
    }),
  ),
});

export type PersonCandidate = z.infer<typeof personCandidateSchema>;
export type CreditCandidate = z.infer<typeof creditCandidateSchema>;
export type SeasonCandidate = z.infer<typeof seasonCandidateSchema>;
export type TitleDetailsCandidate = z.infer<typeof titleDetailsCandidateSchema>;
export type TitleSearchPage = z.infer<typeof titleSearchPageSchema>;
