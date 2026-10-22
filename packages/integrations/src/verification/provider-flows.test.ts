import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  creditCandidateSchema,
  titleDetailsCandidateSchema,
} from "../catalogue-candidates.js";
import {
  mediaCandidateSchema,
  titleCandidateSchema,
  videoCandidateSchema,
  type CandidateField,
  type TitleCandidate,
} from "../contracts.js";
import {
  gameDetailsCandidateSchema,
  gameRelationshipCandidateSchema,
} from "../game-candidates.js";
import {
  gameEnrichmentResultSchema,
  requirementTierSchema,
  systemPlatformSchema,
} from "../game-supplements.js";
import { providerMappingKey } from "../identity.js";
import { createIgdbAdapter } from "../providers/igdb/adapter.js";
import { completion, game, instant } from "../providers/igdb/fixtures.js";
import { createSteamAdapter } from "../providers/steam/adapter.js";
import { app } from "../providers/steam/fixtures.js";
import { createTmdbAdapter } from "../providers/tmdb/adapter.js";
import { movie, person, series } from "../providers/tmdb/fixtures.js";
import { recommendCatalogueMedia } from "../selection/index.js";

function knownValue<T>(field: CandidateField<T>): T {
  expect(field.state).toBe("known");
  if (field.state !== "known") throw new Error("Expected known fixture data.");
  return field.value;
}
function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): URL {
  return new URL(input instanceof Request ? input.url : String(input));
}

// Synthetic provider excerpts exercise categories, not a claim of live catalogue accuracy.
const screens = [
  {
    label: "popular movie with credits and multiple artwork candidates",
    kind: "movie",
    raw: movie,
  },
  {
    label: "older movie with a date-only release",
    kind: "movie",
    raw: {
      ...movie,
      id: 1001,
      title: "Archive Adventure",
      original_title: "Archive Adventure",
      release_date: "1933-03-02",
    },
  },
  {
    label: "Indian film with a market-specific certification",
    kind: "movie",
    raw: {
      ...movie,
      id: 1002,
      title: "Indian Film Fixture",
      original_title: "भारत का सफ़र",
      original_language: "hi",
      production_countries: [{ iso_3166_1: "IN" }],
      release_dates: {
        results: [
          {
            iso_3166_1: "IN",
            release_dates: [{ certification: "UA 13+", system: "CBFC" }],
          },
        ],
      },
    },
  },
  {
    label: "anime film with positive language and country evidence",
    kind: "movie",
    raw: {
      ...movie,
      id: 1003,
      title: "Anime Film Fixture",
      original_title: "空の旅",
      original_language: "ja",
      production_countries: [{ iso_3166_1: "JP" }],
      genres: [{ id: 16, name: "Animation" }],
      keywords: { keywords: [{ id: 1, name: "anime" }] },
    },
  },
  {
    label: "ongoing series",
    kind: "series",
    raw: {
      ...series,
      id: 31000,
      name: "Continuing Series Fixture",
      original_name: "Continuing Series Fixture",
      status: "Returning Series",
      last_air_date: "2026-10-01",
    },
  },
  {
    label: "completed anime series with seasons and role-specific credits",
    kind: "series",
    raw: series,
  },
  {
    label: "series with incomplete and malformed optional metadata",
    kind: "series",
    raw: {
      id: 31001,
      name: "Incomplete series",
      status: "Future provider status",
      first_air_date: "",
      images: { broken: true },
      content_ratings: { broken: true },
      seasons: [],
    },
  },
] as const;

const games = [
  {
    label: "popular game with optional Steam requirements",
    raw: game,
    steam: "available",
  },
  {
    label: "older game with square cover and year-only release",
    raw: {
      ...game,
      id: 101,
      name: "Archive Game Fixture",
      cover: { ...game.cover, width: 600, height: 600 },
      first_release_date: 883_612_800,
      game_status: null,
      release_dates: [
        {
          ...game.release_dates[0],
          date: 883_612_800,
          y: 1998,
          date_format: { format: "YYYY" },
        },
      ],
    },
    steam: "available",
  },
  {
    label: "upcoming game with quarter precision",
    raw: {
      ...game,
      id: 102,
      name: "Upcoming Game Fixture",
      first_release_date: 1_798_761_600,
      game_status: { status: "Upcoming" },
      release_dates: [
        {
          ...game.release_dates[0],
          date: 1_798_761_600,
          y: 2027,
          m: 1,
          d: 1,
          date_format: { format: "YYYYQ2" },
        },
      ],
    },
    steam: "available",
  },
  {
    label: "DLC-heavy base game with explicit child relationships",
    raw: {
      ...game,
      id: 103,
      name: "DLC-Heavy Game Fixture",
      dlcs: [
        { id: 43, name: "Expansion A" },
        { id: 47, name: "Expansion B" },
      ],
    },
    steam: "available",
  },
  {
    label: "DLC with a scoped parent reference",
    raw: {
      ...game,
      id: 104,
      name: "DLC Fixture",
      game_type: { type: "DLC" },
      parent_game: { id: 41, name: "Base Game" },
      dlcs: [],
      expansions: [],
      remakes: [],
      remasters: [],
    },
    steam: "available",
  },
  {
    label: "incomplete game without a confirmed Steam mapping",
    raw: { id: 105, name: "Incomplete Game" },
    steam: "absent",
  },
  {
    label: "usable game despite unavailable Steam and completion metadata",
    raw: { ...game, id: 106, name: "Game With Unavailable Supplements" },
    steam: "unavailable",
  },
] as const;

// Read schema source in tests only; the runtime package has no Prisma dependency.
const schemaText = [
  "catalogue",
  "catalogue-media",
  "catalogue-people",
  "catalogue-taxonomy",
]
  .map((domain) =>
    readFileSync(
      new URL(`../../../db/prisma/${domain}.prisma`, import.meta.url),
      "utf8",
    ),
  )
  .join("\n");
function dbEnum(name: string): string[] {
  const body = new RegExp(`enum ${name} \\{([^}]+)\\}`).exec(schemaText)?.[1];
  if (!body) throw new Error(`Missing catalogue enum ${name}.`);
  return body.trim().split(/\s+/);
}
function checkTitle(title: TitleCandidate) {
  expect(dbEnum("TitleType")).toContain(title.type);
  if (title.type === "MOVIE")
    expect(dbEnum("MovieStatus")).toContain(title.metadata.status);
  if (title.type === "SERIES")
    expect(dbEnum("SeriesStatus")).toContain(title.metadata.status);
  if (title.type === "GAME") {
    expect(dbEnum("GameReleaseStatus")).toContain(title.metadata.releaseStatus);
    expect(dbEnum("GameType")).toContain(title.metadata.gameType);
    if (title.metadata.modes.state === "known")
      for (const mode of title.metadata.modes.value)
        expect(dbEnum("GameMode")).toContain(mode);
  }
  expect(title).not.toHaveProperty("id");
  expect(title).not.toHaveProperty("publicationStatus");
  for (const mapping of title.mappings)
    expect(providerMappingKey(mapping.identity).providerId).toBe(
      `${mapping.identity.entity}:${mapping.identity.id}`,
    );
}

describe("bounded provider-to-candidate verification", () => {
  it("keeps provider-independent contract enums compatible with the catalogue models", () => {
    expect(
      new Set([
        ...screens.map((entry) => `TMDB:${entry.kind}:${entry.raw.id}`),
        ...games.map((entry) => `IGDB:game:${entry.raw.id}`),
      ]).size,
    ).toBe(14);
    const [movie, series, game] = titleCandidateSchema.options;
    for (const [name, values] of [
      [
        "TitleType",
        titleCandidateSchema.options.map((option) => option.shape.type.value),
      ],
      ["MovieStatus", movie.shape.metadata.shape.status.options],
      ["SeriesStatus", series.shape.metadata.shape.status.options],
      ["GameReleaseStatus", game.shape.metadata.shape.releaseStatus.options],
      ["GameType", game.shape.metadata.shape.gameType.options],
      ["SystemPlatform", systemPlatformSchema.options],
      ["RequirementTier", requirementTierSchema.options],
      ["TitleRelationType", gameRelationshipCandidateSchema.shape.type.options],
      ["CreditType", creditCandidateSchema.shape.type.options],
      [
        "VideoType",
        videoCandidateSchema.shape.type.options[0].shape.value.options,
      ],
    ] as const)
      expect(new Set(values)).toEqual(new Set(dbEnum(name)));
    expect(dbEnum("MediaPurpose")).toEqual(
      expect.arrayContaining(
        mediaCandidateSchema.shape.purpose.unwrap().options,
      ),
    );
  });
  it.each(screens)(
    "normalizes and recommends $label through the HTTP adapter",
    async ({ kind, raw, label }) => {
      const fetch = vi.fn<typeof globalThis.fetch>((input) => {
        const url = requestUrl(input);
        if (url.pathname.startsWith("/3/person/"))
          return Promise.resolve(
            Response.json({
              ...person,
              id: Number(url.pathname.split("/").at(-1)),
            }),
          );
        expect(url.searchParams.get("append_to_response")).toContain(
          "images,videos",
        );
        return Promise.resolve(Response.json(raw));
      });
      const logger = { warn: vi.fn() };
      const adapter = createTmdbAdapter(
        {
          accessToken: "fixture-secret",
          normalization: { preferredMarket: "IN", fallbackMarkets: ["US"] },
          http: { requestsPerSecond: 100, maxAttempts: 1 },
        },
        { fetch, now: () => new Date(instant), logger },
      );
      const result =
        kind === "movie"
          ? await adapter.getMovie(String(raw.id), { peopleLimit: 2 })
          : await adapter.getSeries(String(raw.id), { peopleLimit: 2 });
      expect(titleDetailsCandidateSchema.safeParse(result).success).toBe(true);
      checkTitle(result.title);
      expect(result.recommendations).toEqual(recommendCatalogueMedia(result));
      expect(result.title.metadata.dubbedLanguageCodes).toEqual({
        state: "missing",
        reason: "UNSUPPORTED",
      });
      expect(fetch.mock.calls.length).toBeLessThanOrEqual(3);
      expect(
        new Set(fetch.mock.calls.map(([url]) => requestUrl(url).href)).size,
      ).toBe(fetch.mock.calls.length);
      if (label.startsWith("Indian"))
        expect(result.title.ageRating).toMatchObject({
          value: {
            effectiveCertificationSystem: "CBFC",
            normalizedAgeRating: "13+",
          },
        });
      if (label.startsWith("anime") || label.startsWith("completed anime"))
        expect(result.title.isAnime).toMatchObject({
          value: true,
          certainty: "INFERRED",
        });
      if (label.startsWith("completed")) {
        expect(knownValue(result.seasons)).toHaveLength(2);
        expect(
          knownValue(result.credits).filter(
            (credit) => credit.personIdentity.id === "5",
          ),
        ).toHaveLength(2);
        expect(knownValue(result.seasons)[1]?.media).toMatchObject({
          value: [{ owner: { kind: "SEASON" }, purpose: "POSTER" }],
        });
      }
      if (label.startsWith("popular")) {
        expect(knownValue(result.watchProviders)).toHaveLength(3);
        expect(result.recommendations?.hero.alternatives).toHaveLength(1);
        expect(result.recommendations?.video.rejected.length).toBeGreaterThan(
          0,
        );
      }
      if (label.startsWith("series with incomplete")) {
        expect(result.title.metadata.status).toBe("UNKNOWN");
        expect(result.title.primaryReleaseDate.state).toBe("missing");
        expect(result.recommendations?.hero.recommended).toBeNull();
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            section: "images",
            code: "INVALID_RESPONSE",
          }),
        );
      }
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
        "fixture-secret",
      );
    },
  );

  it.each(games)(
    "normalizes and optionally enriches $label through the HTTP adapters",
    async ({ raw, steam, label }) => {
      const fetch = vi.fn<typeof globalThis.fetch>((input) => {
        const url = requestUrl(input);
        if (url.hostname === "id.twitch.tv")
          return Promise.resolve(
            Response.json({
              access_token: "fixture-token",
              expires_in: 3600,
              token_type: "bearer",
            }),
          );
        if (url.pathname === "/v4/games")
          return Promise.resolve(Response.json([raw]));
        if (url.pathname === "/v4/game_time_to_beats")
          return Promise.resolve(
            steam === "unavailable"
              ? new Response(null, { status: 503 })
              : Response.json([{ ...completion, game_id: raw.id }]),
          );
        expect(url.origin + url.pathname).toBe(
          "https://store.steampowered.com/api/appdetails",
        );
        expect(url.searchParams.get("appids")).toBe("123456");
        return Promise.resolve(
          steam === "unavailable"
            ? new Response(null, { status: 503 })
            : Response.json({
                "123456": {
                  success: true,
                  data: {
                    ...app,
                    steam_appid: 123456,
                    type: label.startsWith("DLC with") ? "dlc" : "game",
                  },
                },
              }),
        );
      });
      const logger = { warn: vi.fn() };
      const dependencies = { fetch, now: () => new Date(instant), logger };
      const adapter = createIgdbAdapter(
        {
          credentials: {
            clientId: "fixture-client",
            clientSecret: "fixture-secret",
          },
          http: { maxAttempts: 1 },
        },
        dependencies,
      );
      const candidate = await adapter.getGame(String(raw.id));
      if (!candidate) throw new Error("Missing fixture game.");
      expect(gameDetailsCandidateSchema.safeParse(candidate).success).toBe(
        true,
      );
      checkTitle(candidate.title);
      expect(candidate.recommendations).toEqual(
        recommendCatalogueMedia(candidate),
      );
      const original = structuredClone(candidate);
      const enriched = await createSteamAdapter(
        { http: { maxAttempts: 1 } },
        dependencies,
      ).enrichGame(candidate);
      expect(gameEnrichmentResultSchema.safeParse(enriched).success).toBe(true);
      expect(enriched.candidate).toEqual(original);
      expect(candidate).toEqual(original);
      if (steam === "available") {
        const supplement = knownValue(enriched.supplementary);
        const rows = knownValue(supplement.systemRequirements);
        expect(rows).toHaveLength(5);
        expect(
          rows.find(
            (row) => row.platform === "WINDOWS" && row.tier === "MINIMUM",
          ),
        ).toMatchObject({ ramMb: 8192, storageMb: 51200 });
        for (const row of rows) {
          expect(dbEnum("SystemPlatform")).toContain(row.platform);
          expect(dbEnum("RequirementTier")).toContain(row.tier);
          expect(row.rawText).not.toMatch(/<strong>/);
          expect(row.provenance.identity).toEqual(supplement.identity);
        }
      } else {
        expect(enriched.supplementary).toEqual({
          state: "missing",
          reason: steam === "absent" ? "NOT_PROVIDED" : "UNAVAILABLE",
        });
      }
      if (label.startsWith("older")) {
        expect(candidate.title.primaryReleaseDate).toMatchObject({
          value: { precision: "YEAR", year: 1998 },
        });
        expect(candidate.game.releaseStatus.state).toBe("missing");
      }
      if (label.startsWith("upcoming"))
        expect(candidate.title.primaryReleaseDate).toMatchObject({
          value: { precision: "QUARTER", year: 2027, quarter: 2 },
        });
      if (candidate.game.relationships.state === "known")
        for (const relation of candidate.game.relationships.value)
          expect(dbEnum("TitleRelationType")).toContain(relation.type);
      expect(
        fetch.mock.calls.filter(
          ([url]) => requestUrl(url).hostname === "id.twitch.tv",
        ),
      ).toHaveLength(1);
      expect(
        fetch.mock.calls.filter(
          ([url]) => requestUrl(url).hostname === "store.steampowered.com",
        ),
      ).toHaveLength(steam === "absent" ? 0 : 1);
      expect(fetch.mock.calls.length).toBeLessThanOrEqual(4);
      expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(
        /fixture-token|fixture-secret/,
      );
    },
  );
});
