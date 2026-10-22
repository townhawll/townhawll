// Synthetic normalized candidates for validation and database integration tests only.
import { titleCandidateSchema } from "@townhawll/integrations/contracts";
import { titleDetailsCandidateSchema } from "@townhawll/integrations/catalogue-candidates";
import { gameDetailsCandidateSchema } from "@townhawll/integrations/game-candidates";
import { getEffectivePermissions } from "@townhawll/auth/permissions";
import type { StaffContext } from "@townhawll/auth/staff-context";
import type { StaffRole } from "@townhawll/db";
import {
  validateImportSubmission,
  type ValidatedImportSubmission,
} from "./validation.ts";

export const missing = { state: "missing", reason: "NOT_PROVIDED" } as const;
export function submissionFixture(
  id = "123",
  type: "MOVIE" | "SERIES" | "GAME" = "MOVIE",
  title = "Ingestion Fixture",
) {
  const identity =
    type === "GAME"
      ? { provider: "IGDB", entity: "game", id }
      : { provider: "TMDB", entity: type === "MOVIE" ? "movie" : "series", id };
  const source = {
    identity,
    fetchedAt: "2026-10-22T12:00:00Z",
    sourceUpdatedAt: null,
    sourceUrl: null,
  };
  const base = {
    identity,
    mappings: [source],
    title,
    originalTitle: missing,
    overview: missing,
    primaryReleaseDate: missing,
    isAnime: missing,
    aliases: missing,
    certifications: missing,
    media: missing,
    videos: missing,
  };
  const candidateTitle = titleCandidateSchema.parse(
    type === "MOVIE"
      ? {
          ...base,
          type,
          metadata: {
            status: "UNKNOWN",
            runtimeMinutes: missing,
            originalLanguageCode: missing,
            dubbedLanguageCodes: missing,
            productionCountryCodes: missing,
          },
        }
      : type === "SERIES"
        ? {
            ...base,
            type,
            metadata: {
              status: "UNKNOWN",
              lastAirDate: missing,
              averageEpisodeRuntime: missing,
              numberOfSeasons: missing,
              numberOfEpisodes: missing,
              originalLanguageCode: missing,
              dubbedLanguageCodes: missing,
              originCountryCodes: missing,
            },
          }
        : {
            ...base,
            type,
            metadata: {
              releaseStatus: "UNKNOWN",
              gameType: "OTHER",
              primaryLanguageCode: missing,
              modes: missing,
            },
          },
  );
  const baseDetails = {
    title: candidateTitle,
    genres: missing,
    keywords: missing,
    credits: missing,
    people: [],
    companies: missing,
    franchises: missing,
    seasons: missing,
    watchProviders: missing,
    sourceStatus: missing,
    sourceSpokenLanguageCodes: missing,
    sourceEpisodeRuntimes: missing,
    providerPopularity: missing,
    issues: [],
  };
  const candidate =
    type === "GAME"
      ? gameDetailsCandidateSchema.parse({
          ...baseDetails,
          game: {
            sourceGameType: missing,
            sourceStoryline: missing,
            firstReleaseTimestamp: missing,
            releaseStatus: missing,
            sourceGameModes: missing,
            themes: missing,
            platforms: missing,
            releaseEvents: missing,
            relationships: missing,
            sourceRatings: missing,
            completionTime: missing,
            confirmedSteamIdentities: missing,
            unresolvedReferences: [],
          },
        })
      : titleDetailsCandidateSchema.parse(baseDetails);
  return {
    candidate,
    canonical: { type, title, slug: `fixture-${id}-${type.toLowerCase()}` },
    selectedMedia: [],
    selectedVideos: [],
  };
}
export function validFixture(
  id = "123",
  type: "MOVIE" | "SERIES" | "GAME" = "MOVIE",
  title = "Ingestion Fixture",
): ValidatedImportSubmission {
  const result = validateImportSubmission(submissionFixture(id, type, title));
  if (!result.valid) throw new Error("Invalid ingestion test fixture.");
  return result.data;
}
export function staffFixture(
  userId = "staff-fixture",
  roles: StaffRole[] = ["CONTENT_EDITOR"],
): StaffContext {
  return {
    userId,
    roles,
    permissions: getEffectivePermissions(roles),
    accountStatus: "ACTIVE",
    email: "staff@example.test",
    name: null,
    username: null,
  };
}
