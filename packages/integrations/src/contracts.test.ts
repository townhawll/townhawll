import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  candidateFieldSchema,
  mediaCandidateSchema,
  releaseDateSchema,
  sourceUrlSchema,
  titleCandidateSchema,
} from "./contracts.js";
import {
  providerIdentityKey,
  providerIdentitySchema,
  providerMappingKey,
  type ProviderIdentity,
} from "./identity.js";

const identity = { provider: "TMDB", entity: "movie", id: "123" } as const;
const provenance = {
  identity,
  fetchedAt: "2026-10-20T12:00:00Z",
  sourceUpdatedAt: null,
  sourceUrl: null,
};
const missing = { state: "missing", reason: "NOT_PROVIDED" } as const;
const movie = {
  identity,
  mappings: [provenance],
  type: "MOVIE",
  title: "Example",
  originalTitle: missing,
  overview: missing,
  primaryReleaseDate: missing,
  isAnime: missing,
  aliases: missing,
  certifications: missing,
  media: missing,
  videos: missing,
  metadata: {
    status: "UNKNOWN",
    runtimeMinutes: missing,
    originalLanguageCode: missing,
    dubbedLanguageCodes: missing,
    productionCountryCodes: missing,
  },
};

describe("provider identities", () => {
  it("does not collide across provider, entity or mapping scope", () => {
    const identities: ProviderIdentity[] = [
      identity,
      { ...identity, entity: "series" },
      { ...identity, entity: "company" },
      { ...identity, entity: "network" },
      { provider: "IGDB", entity: "game", id: "123" },
      { provider: "STEAM", entity: "app", id: "123" },
      { provider: "IGDB", entity: "collection", id: "123" },
      { provider: "IGDB", entity: "franchise", id: "123" },
    ];
    expect(new Set(identities.map(providerIdentityKey)).size).toBe(
      identities.length,
    );
    expect(
      new Set(
        identities.map((value) => JSON.stringify(providerMappingKey(value))),
      ).size,
    ).toBe(identities.length);
    expect(providerMappingKey(identity)).toEqual({
      provider: "TMDB",
      providerId: "movie:123",
    });
  });

  it.each(["0", "00123", "-1", "1.2", "name", "movie:123", "123:456"])(
    "rejects noncanonical external IDs: %s",
    (id) => {
      expect(
        providerIdentitySchema.safeParse({ ...identity, id }).success,
      ).toBe(false);
    },
  );

  it("preserves large decimal IDs and rejects impossible provider/entity pairs", () => {
    const large = { ...identity, id: "9007199254740993" };
    expect(providerIdentityKey(large)).toBe("TMDB:movie:9007199254740993");
    expect(
      providerIdentitySchema.safeParse({
        provider: "STEAM",
        entity: "movie",
        id: "123",
      }).success,
    ).toBe(false);
    expect(
      providerIdentitySchema.safeParse({ ...identity, id: 123 }).success,
    ).toBe(false);
  });
});

describe("normalized candidate contracts", () => {
  it("accepts a review candidate with explicitly missing data and no DB identity", () => {
    expect(titleCandidateSchema.parse(movie)).toEqual(movie);
    expect(
      titleCandidateSchema.safeParse({
        ...movie,
        publicationStatus: "PUBLISHED",
      }).success,
    ).toBe(false);
    expect(
      titleCandidateSchema.safeParse({ ...movie, id: "townhawll-id" }).success,
    ).toBe(false);
  });

  it("requires matching title identity/type and primary mapping", () => {
    expect(
      titleCandidateSchema.safeParse({
        ...movie,
        identity: { ...identity, entity: "series" },
      }).success,
    ).toBe(false);
    expect(
      titleCandidateSchema.safeParse({
        ...movie,
        mappings: [provenance, provenance],
      }).success,
    ).toBe(false);
    expect(
      titleCandidateSchema.safeParse({
        ...movie,
        mappings: [
          provenance,
          { ...provenance, identity: { ...identity, entity: "person" } },
        ],
      }).success,
    ).toBe(false);
    expect(
      titleCandidateSchema.safeParse({ ...movie, mappings: [] }).success,
    ).toBe(false);
    expect(
      titleCandidateSchema.safeParse({
        ...movie,
        mappings: [{ ...provenance, identity: { ...identity, id: "456" } }],
      }).success,
    ).toBe(false);
  });

  it("separates unknown, unavailable, empty and inferred data", () => {
    const schema = candidateFieldSchema(z.array(z.string()));
    const known = {
      state: "known",
      value: [],
      certainty: "PROVIDED",
      evidence: [],
      provenance,
    };
    expect(schema.parse(known)).toEqual(known);
    expect(
      schema.parse({ state: "missing", reason: "UNAVAILABLE" }),
    ).not.toEqual(known);
    expect(schema.safeParse([]).success).toBe(false);
    expect(schema.safeParse({ ...known, provenance: undefined }).success).toBe(
      false,
    );
    expect(
      schema.parse({
        ...known,
        certainty: "INFERRED",
        evidence: ["Provider classification evidence"],
      }),
    ).toHaveProperty("certainty", "INFERRED");
    expect(
      schema.safeParse({ ...known, certainty: "INFERRED", evidence: [] })
        .success,
    ).toBe(false);
  });

  it("preserves partial dates without inventing a day or allowing invalid calendar dates", () => {
    expect(releaseDateSchema.parse({ precision: "YEAR", year: 2027 })).toEqual({
      precision: "YEAR",
      year: 2027,
    });
    expect(
      releaseDateSchema.parse({ precision: "QUARTER", year: 2027, quarter: 2 }),
    ).toEqual({ precision: "QUARTER", year: 2027, quarter: 2 });
    for (const value of [
      { precision: "DAY", date: "2026-02-30" },
      { precision: "DAY", date: "2026-01-01T00:00:00Z" },
      { precision: "MONTH", year: 2026, month: 13 },
    ]) {
      expect(releaseDateSchema.safeParse(value).success).toBe(false);
    }
  });

  it("keeps game/series metadata aligned to the existing catalogue vocabulary", () => {
    const gameIdentity = {
      provider: "IGDB",
      entity: "game",
      id: "123",
    } as const;
    const game = {
      ...movie,
      type: "GAME",
      identity: gameIdentity,
      mappings: [{ ...provenance, identity: gameIdentity }],
      metadata: {
        releaseStatus: "UNKNOWN",
        gameType: "OTHER",
        primaryLanguageCode: missing,
        modes: missing,
      },
    };
    expect(titleCandidateSchema.safeParse(game).success).toBe(true);
    expect(
      titleCandidateSchema.safeParse({ ...movie, type: "SHOW" }).success,
    ).toBe(false);
    expect(
      titleCandidateSchema.safeParse({
        ...movie,
        metadata: {
          ...movie.metadata,
          runtimeMinutes: {
            state: "known",
            value: -5,
            certainty: "PROVIDED",
            evidence: [],
            provenance,
          },
        },
      }).success,
    ).toBe(false);
  });

  it("only describes unprocessed catalogue media with one valid owner", () => {
    const media = {
      owner: { kind: "TITLE", identity },
      purpose: "POSTER",
      sourceType: "POSTER",
      providerAssetId: "/image.jpg",
      sourceUrl: "https://image.tmdb.org/t/p/original/image.jpg",
      width: null,
      height: null,
      languageCode: null,
      provenance,
    };
    expect(mediaCandidateSchema.parse(media)).toEqual(media);
    expect(
      mediaCandidateSchema.safeParse({
        ...media,
        owner: { kind: "PERSON", identity },
      }).success,
    ).toBe(false);
    expect(
      mediaCandidateSchema.safeParse({ ...media, purpose: "AVATAR" }).success,
    ).toBe(false);
    expect(
      mediaCandidateSchema.safeParse({ ...media, sourceType: "SCREENSHOT" })
        .success,
    ).toBe(false);
    expect(
      mediaCandidateSchema.safeParse({ ...media, objectKey: "titles/x.webp" })
        .success,
    ).toBe(false);
    expect(mediaCandidateSchema.safeParse({ ...media, width: 0 }).success).toBe(
      false,
    );
  });

  it.each([
    "http://image.example/a",
    "https://user:secret@image.example/a",
    "https://image.example/a?api_key=secret",
  ])("rejects credential-bearing/non-HTTPS source references: %s", (url) => {
    expect(sourceUrlSchema.safeParse(url).success).toBe(false);
  });
});
