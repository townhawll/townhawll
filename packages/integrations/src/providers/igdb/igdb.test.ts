import { describe, expect, it, vi } from "vitest";

import { mediaCandidateSchema, type CandidateField } from "../../contracts.js";
import {
  gameDetailsCandidateSchema,
  gameRelationshipCandidateSchema,
} from "../../game-candidates.js";
import { providerIdentityKey } from "../../identity.js";
import { createIgdbAdapter } from "./index.js";
import { game, completion, instant } from "./fixtures.js";
import { normalizeGame, normalizeCompletion } from "./normalize.js";
import { gameSchema } from "./schemas.js";
import { identity, provenance } from "./values.js";

function value<T>(field: CandidateField<T>): T {
  expect(field.state).toBe("known");
  if (field.state !== "known") throw new Error("Expected known fixture value.");
  return field.value;
}
function normalized(input: unknown = game) {
  return gameDetailsCandidateSchema.parse(
    normalizeGame(gameSchema.parse(input), instant),
  );
}
function setup(
  route: (url: URL, init?: RequestInit) => unknown = () => [game],
  http: { maxAttempts?: number; baseDelayMs?: number } = {},
) {
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const data =
      url.hostname === "id.twitch.tv"
        ? { access_token: "test-token", expires_in: 3600, token_type: "bearer" }
        : route(url, init);
    return Promise.resolve(
      data instanceof Response ? data : Response.json(data),
    );
  });
  const logger = { warn: vi.fn() };
  const adapter = createIgdbAdapter(
    {
      credentials: { clientId: "test-client", clientSecret: "test-secret" },
      http: { maxAttempts: 1, ...http },
    },
    { fetch, now: () => new Date(instant), logger },
  );
  return { adapter, fetch, logger };
}

describe("IGDB queries and transport", () => {
  it("searches by name with bounded filters and a look-ahead record for pagination", async () => {
    const { adapter, fetch } = setup((url, init) => {
      expect(url.pathname).toBe("/v4/games");
      expect(init).toMatchObject({
        method: "POST",
        headers: {
          "Client-ID": "test-client",
          Authorization: "Bearer test-token",
        },
        redirect: "manual",
      });
      expect(init?.body).toContain(
        'search "Example & Friends"; where platforms = (6) & game_type = (1,2); limit 2; offset 20;',
      );
      return [game, { ...game, id: 43 }];
    });
    const result = await adapter.searchGames({
      query: " Example & Friends ",
      limit: 1,
      offset: 20,
      platformIds: ["6", "6"],
      gameTypeIds: ["1", "2"],
    });
    expect(result).toMatchObject({ offset: 20, limit: 1, nextOffset: 21 });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.identity).toEqual({
      provider: "IGDB",
      entity: "game",
      id: "42",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("returns an empty final search page without inventing totals", async () => {
    const { adapter } = setup(() => []);
    expect(await adapter.searchGames({ query: "absent" })).toEqual({
      offset: 0,
      limit: 20,
      nextOffset: null,
      results: [],
    });
  });
  it("accepts the documented zero-valued main-game type filter", async () => {
    const { adapter } = setup((_url, init) => {
      expect(init?.body).toContain("game_type = (0)");
      return [];
    });
    await adapter.searchGames({ query: "Example", gameTypeIds: ["0"] });
  });
  it.each(['"; fields *;', "back\\slash", "line\nbreak", "\0", " "])(
    "rejects unsafe/empty search %j before I/O",
    async (query) => {
      const { adapter, fetch } = setup();
      await expect(adapter.searchGames({ query })).rejects.toMatchObject({
        code: "INVALID_REQUEST",
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each([
    { query: "game", limit: 51 },
    { query: "game", offset: -1 },
    { query: "game", platformIds: ["6;drop"] },
    { query: "game", gameTypeIds: ["-1"] },
  ])("rejects invalid pagination/filter values", async (input) => {
    const { adapter, fetch } = setup();
    await expect(adapter.searchGames(input)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["0", "042", "-1", "42; limit 500", "2147483648"])(
    "rejects invalid detail ID %s",
    async (id) => {
      const { adapter, fetch } = setup();
      await expect(adapter.getGame(id)).rejects.toMatchObject({
        code: "INVALID_REQUEST",
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("fetches expanded details and exactly one completion supplement", async () => {
    const { adapter, fetch } = setup((url, init) => {
      if (url.pathname.endsWith("game_time_to_beats")) return [completion];
      expect(init?.body).toContain("where id = 42; limit 1;");
      expect(init?.body).not.toContain("fields *");
      return [game];
    });
    const result = await adapter.getGame("42");
    expect(result?.title.title).toBe(game.name);
    expect(value(result!.game.completionTime).mainStoryMinutes).toMatchObject({
      state: "known",
      value: 60,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("returns null for absent games without fan-out", async () => {
    const { adapter, fetch } = setup(() => []);
    expect(await adapter.getGame("42")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("retains a game if completion data fails, logging safe metadata only", async () => {
    const { adapter, logger } = setup((url) =>
      url.pathname.endsWith("game_time_to_beats")
        ? new Response("secret raw response", { status: 500 })
        : [game],
    );
    const result = await adapter.getGame("42");
    expect(result?.game.completionTime).toEqual({
      state: "missing",
      reason: "UNAVAILABLE",
    });
    expect(result?.issues).toMatchObject([
      { section: "completionTime", code: "HTTP" },
    ]);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(
      /test-secret|test-token|secret raw response/,
    );
  });
  it("handles an empty completion response as not provided", async () => {
    const { adapter } = setup((url) =>
      url.pathname.endsWith("game_time_to_beats") ? [] : [game],
    );
    const result = await adapter.getGame("42");
    expect(result?.game.completionTime).toEqual({
      state: "missing",
      reason: "NOT_PROVIDED",
    });
    expect(result?.issues).toEqual([]);
  });
  it.each([
    {},
    [{ id: 42 }],
    [{ ...game, id: 43 }],
    [game, game],
    [{ ...game, cover: { image_id: "../escape" } }],
  ])("rejects malformed/mismatched detail responses", async (response) => {
    const { adapter } = setup(() => response);
    await expect(
      adapter.getGame("42", { includeCompletionTime: false }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("refuses completion data for a different game", async () => {
    const { adapter } = setup((url) =>
      url.pathname.endsWith("game_time_to_beats")
        ? [{ ...completion, game_id: 43 }]
        : [game],
    );
    const result = await adapter.getGame("42");
    expect(result?.game.completionTime).toMatchObject({
      state: "missing",
      reason: "UNAVAILABLE",
    });
    expect(result?.issues[0]?.code).toBe("INVALID_RESPONSE");
  });
  it("retries read-only POSTs on transient failures and 429", async () => {
    let calls = 0;
    const { adapter, fetch } = setup(
      () =>
        ++calls === 1
          ? new Response(null, { status: 429, headers: { "Retry-After": "0" } })
          : ++calls === 3
            ? new Response(null, { status: 503 })
            : [game],
      { maxAttempts: 3, baseDelayMs: 1 },
    );
    expect(
      (await adapter.getGame("42", { includeCompletionTime: false }))?.title
        .title,
    ).toBe(game.name);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("does not exceed provider concurrency/rate limits through configuration", () => {
    expect(() =>
      createIgdbAdapter({
        credentials: { clientId: "id", clientSecret: "secret" },
        http: { requestsPerSecond: 5 },
      }),
    ).toThrow(/four requests/);
    expect(() =>
      createIgdbAdapter({
        credentials: { clientId: "id", clientSecret: "secret" },
        http: { concurrency: 9 },
      }),
    ).toThrow(/eight concurrent/);
  });
  it("paces searches to four starts per second", async () => {
    const starts: number[] = [];
    const { adapter } = setup(() => {
      starts.push(Date.now());
      return [];
    });
    await Promise.all([
      adapter.searchGames({ query: "a" }),
      adapter.searchGames({ query: "b" }),
      adapter.searchGames({ query: "c" }),
    ]);
    expect(starts[2]! - starts[0]!).toBeGreaterThanOrEqual(480);
  });
});

describe("IGDB authentication recovery", () => {
  function authenticatedRoute(alwaysFail = false) {
    let tokens = 0;
    const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === "id.twitch.tv")
        return Promise.resolve(
          Response.json({
            access_token: `token-${++tokens}`,
            expires_in: 3600,
            token_type: "bearer",
          }),
        );
      return Promise.resolve(
        new Headers(init?.headers).get("Authorization") === "Bearer token-1" ||
          alwaysFail
          ? new Response(null, { status: 401 })
          : Response.json([game]),
      );
    });
    const adapter = createIgdbAdapter(
      { credentials: { clientId: "id", clientSecret: "secret" } },
      { fetch },
    );
    return { adapter, fetch, tokenCount: () => tokens };
  }
  it("refreshes once on 401, including parallel requests sharing the stale token", async () => {
    const { adapter, tokenCount } = authenticatedRoute();
    const results = await Promise.all([
      adapter.getGame("42", { includeCompletionTime: false }),
      adapter.getGame("42", { includeCompletionTime: false }),
    ]);
    expect(results.every((result) => result?.title.title === game.name)).toBe(
      true,
    );
    expect(tokenCount()).toBe(2);
  });
  it("stops after one recovery rather than looping indefinitely", async () => {
    const { adapter, fetch, tokenCount } = authenticatedRoute(true);
    await expect(
      adapter.getGame("42", { includeCompletionTime: false }),
    ).rejects.toMatchObject({ status: 401 });
    expect(tokenCount()).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("propagates caller cancellation without querying IGDB", async () => {
    const { adapter, fetch } = setup();
    await expect(
      adapter.getGame("42", { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("IGDB pure normalization", () => {
  it("preserves scoped identities and complete game metadata without canonical IDs", () => {
    const result = normalized();
    expect(result.title.type).toBe("GAME");
    expect(result.title.metadata).toMatchObject({
      gameType: "MAIN_GAME",
      releaseStatus: "RELEASED",
    });
    expect(result.title).not.toHaveProperty("id");
    expect(result.title).not.toHaveProperty("slug");
    expect(value(result.title.aliases)).toHaveLength(1);
    expect(value(result.game.themes)[0]?.identity).toMatchObject({
      entity: "theme",
      id: "1",
    });
    expect(value(result.keywords)[0]?.identity).toMatchObject({
      entity: "keyword",
      id: "1",
    });
    expect(value(result.game.platforms)[0]?.identity).toMatchObject({
      entity: "platform",
      id: "6",
    });
    expect(value(result.companies).map((company) => company.role)).toEqual([
      "DEVELOPER",
      "PUBLISHER",
    ]);
    expect(
      new Set(
        value(result.franchises).map((franchise) =>
          providerIdentityKey(franchise.identity),
        ),
      ).size,
    ).toBe(2);
    expect(result.game.sourceStoryline).toMatchObject({
      value: game.storyline,
    });
    expect(result.title.metadata).toMatchObject({
      modes: { value: ["SINGLE_PLAYER", "CO_OP"] },
      primaryLanguageCode: { reason: "UNSUPPORTED" },
    });
  });
  it("keeps missing game data unknown rather than inventing a main game/status/date", () => {
    const result = normalized({ id: 42, name: "Unknown" });
    expect(result.title.metadata).toMatchObject({
      gameType: "OTHER",
      releaseStatus: "UNKNOWN",
    });
    expect(result.title.primaryReleaseDate).toMatchObject({ state: "missing" });
    expect(result.game.platforms).toMatchObject({ state: "missing" });
    expect(result.title.certifications).toMatchObject({ state: "missing" });
  });
  it.each([
    ["YYYYMMMMDD", 1, 1, { precision: "DAY", date: "2020-01-01" }],
    ["YYYYMMMM", 1, 0, { precision: "MONTH", year: 2020, month: 1 }],
    ["YYYY", 0, 0, { precision: "YEAR", year: 2020 }],
    ["YYYYQ3", 0, 0, { precision: "QUARTER", year: 2020, quarter: 3 }],
  ])("preserves %s date precision", (format, m, d, expected) => {
    const result = normalized({
      ...game,
      release_dates: [
        { ...game.release_dates[0], date_format: { format }, m, d },
      ],
    });
    expect(value(result.title.primaryReleaseDate)).toEqual(expected);
    expect(value(value(result.game.platforms)[0]!.releases[0]!.date)).toEqual(
      expected,
    );
  });
  it.each(["TBD", "FUTURE_FORMAT"])(
    "does not invent an exact date for %s",
    (format) => {
      const result = normalized({
        ...game,
        release_dates: [{ ...game.release_dates[0], date_format: { format } }],
      });
      expect(result.title.primaryReleaseDate.state).toBe("missing");
      expect(value(result.game.releaseEvents)[0]?.sourceTimestamp).toBe(
        game.first_release_date,
      );
    },
  );
  it("does not assume timestamp precision when release evidence is absent", () => {
    const { release_dates: _, ...raw } = game;
    expect(normalized(raw).title.primaryReleaseDate).toMatchObject({
      state: "missing",
      reason: "UNSUPPORTED",
    });
  });
  it("keeps invalid calendar dates unknown and preserves source evidence", () => {
    const result = normalized({
      ...game,
      release_dates: [{ ...game.release_dates[0], m: 2, d: 31 }],
    });
    expect(result.title.primaryReleaseDate.state).toBe("missing");
    expect(value(result.game.releaseEvents)[0]?.sourceLabel).toBe(
      "Jan 1, 2020",
    );
  });
  it("distinguishes inferred release status from explicit status", () => {
    const { game_status: _, ...raw } = game;
    const inferred = normalized(raw);
    expect(inferred.game.releaseStatus).toMatchObject({
      value: "RELEASED",
      certainty: "INFERRED",
      evidence: [expect.any(String)],
    });
    expect(normalized().game.releaseStatus).toMatchObject({
      value: "RELEASED",
      certainty: "PROVIDED",
    });
    const approximate = normalized({
      ...raw,
      release_dates: [
        { ...game.release_dates[0], date_format: { format: "YYYY" } },
      ],
    });
    expect(approximate.title.metadata).toMatchObject({
      releaseStatus: "UNKNOWN",
    });
  });
  it("infers upcoming only from a precision-verified future release day", () => {
    const { game_status: _, ...raw } = game;
    const date = Math.floor(Date.parse("2027-01-01T00:00:00Z") / 1000);
    const result = normalized({
      ...raw,
      first_release_date: date,
      release_dates: [{ ...game.release_dates[0], date, y: 2027 }],
    });
    expect(result.game.releaseStatus).toMatchObject({
      value: "UPCOMING",
      certainty: "INFERRED",
    });
  });
  it("does not select a date when provider components contradict the timestamp", () => {
    const result = normalized({
      ...game,
      release_dates: [{ ...game.release_dates[0], m: 2, d: 28 }],
    });
    expect(result.title.primaryReleaseDate.state).toBe("missing");
  });
  it("maps all supported game modes and preserves unrecognized names", () => {
    const result = normalized({
      ...game,
      game_modes: [
        "Single player",
        "Multiplayer",
        "Co-operative",
        "Massively Multiplayer Online (MMO)",
        "Split screen",
        "Future mode",
      ].map((name, index) => ({ id: index + 1, name })),
    });
    expect(result.title.metadata).toMatchObject({
      modes: {
        value: ["SINGLE_PLAYER", "MULTIPLAYER", "CO_OP", "MMO", "SPLIT_SCREEN"],
      },
    });
    expect(value(result.game.sourceGameModes)).toHaveLength(6);
  });
  it.each([
    ["Early Access", "EARLY_ACCESS"],
    ["Cancelled", "CANCELLED"],
    ["Delayed", "DELAYED"],
    ["Rumored", "UNKNOWN"],
    ["New provider status", "UNKNOWN"],
  ])("maps explicit status %s safely", (status, expected) => {
    const result = normalized({ ...game, game_status: { status } });
    expect(result.title.metadata).toMatchObject({ releaseStatus: expected });
    expect(result.sourceStatus).toMatchObject({ value: status });
  });
  it.each([
    ["DLC / Addon", "DLC"],
    ["Expansion", "EXPANSION"],
    ["Standalone Expansion", "STANDALONE_EXPANSION"],
    ["Remake", "REMAKE"],
    ["Remaster", "REMASTER"],
    ["Expanded Game", "EDITION"],
    ["Bundle", "BUNDLE"],
    ["Port", "OTHER"],
    ["New type", "OTHER"],
  ])("maps game type %s", (type, expected) => {
    expect(
      normalized({ ...game, game_type: { type } }).title.metadata,
    ).toMatchObject({ gameType: expected });
  });
  it("retains unknown mode evidence instead of claiming an empty supported set", () => {
    const result = normalized({
      ...game,
      game_modes: [{ id: 99, name: "Unknown future mode" }],
    });
    expect(result.title.metadata).toMatchObject({
      modes: { state: "missing", reason: "UNSUPPORTED" },
    });
    expect(result.game.sourceGameModes).toMatchObject({
      value: [{ id: "99", name: "Unknown future mode" }],
    });
  });
  it("preserves unexpanded references and platforms found only in release events", () => {
    const result = normalized({
      ...game,
      genres: [99],
      involved_companies: [{ id: 3, developer: true, company: 99 }],
      platforms: [],
      release_dates: [{ ...game.release_dates[0], platform: 6 }],
    });
    expect(result.game.unresolvedReferences).toContainEqual({
      identity: { provider: "IGDB", entity: "genre", id: "99" },
      sourceField: "genres",
    });
    expect(result.game.unresolvedReferences).toContainEqual({
      identity: { provider: "IGDB", entity: "company", id: "99" },
      sourceField: "involved_companies.3",
    });
    expect(value(result.game.platforms)[0]?.name).toMatchObject({
      state: "missing",
    });
  });
  it("preserves typed child-to-parent relationships without fetching or creating related titles", () => {
    const relationships = value(normalized().game.relationships);
    expect(relationships.map((relation) => relation.type)).toEqual([
      "DLC",
      "EXPANSION",
      "REMAKE",
      "REMASTER",
    ]);
    expect(relationships[0]).toMatchObject({
      sourceIdentity: { id: "43" },
      targetIdentity: { id: "42" },
      sourceField: "dlcs",
    });
    expect(relationships[1]?.relatedName).toMatchObject({ state: "missing" });
    expect(relationships.some((relation) => relation.type === "SEQUEL")).toBe(
      false,
    );
  });
  it("handles explicit parent/edition references and drops self-relations", () => {
    const result = normalized({
      ...game,
      id: 43,
      game_type: { type: "DLC / Addon" },
      parent_game: { id: 42, name: "Base" },
      version_parent: 41,
      dlcs: [43],
      remakes: [],
      remasters: [],
      expansions: [],
    });
    expect(value(result.game.relationships)).toMatchObject([
      {
        type: "DLC",
        sourceIdentity: { id: "43" },
        targetIdentity: { id: "42" },
      },
      {
        type: "EDITION",
        sourceIdentity: { id: "43" },
        targetIdentity: { id: "41" },
      },
    ]);
    const relation = value(result.game.relationships)[0]!;
    expect(
      gameRelationshipCandidateSchema.safeParse({
        ...relation,
        targetIdentity: relation.sourceIdentity,
      }).success,
    ).toBe(false);
  });
  it("keeps age certifications system-aware and preserves unsupported raw ratings", () => {
    const result = normalized({
      ...game,
      age_ratings: [
        ...game.age_ratings,
        {
          id: 3,
          organization: { name: "ESRB" },
          rating_category: { rating: "12" },
        },
        {
          id: 4,
          organization: { name: "Unknown board" },
          rating_category: { rating: "T" },
        },
      ],
    });
    expect(value(result.title.certifications)).toMatchObject([
      { system: "ESRB", certification: "T", country: null },
      { system: "PEGI", certification: "12", country: null },
    ]);
    expect(
      value(result.game.sourceRatings).map((rating) => rating.recognized),
    ).toEqual([true, true, false, false]);
    expect(
      normalized({
        ...game,
        age_ratings: [
          {
            id: 4,
            organization: { name: "Unknown" },
            rating_category: { rating: "18" },
          },
        ],
      }).title.certifications,
    ).toMatchObject({ state: "missing", reason: "UNSUPPORTED" });
  });
  it("maps completion time units while retaining source seconds, sample count and timestamp", () => {
    const source = provenance(identity("game", 42), instant);
    const result = value(normalizeCompletion(completion, source));
    expect(result.mainStoryMinutes).toMatchObject({
      value: 60,
      certainty: "INFERRED",
    });
    expect(result.mainPlusExtraMinutes).toMatchObject({ value: 90 });
    expect(result.completionistMinutes).toMatchObject({ value: 120 });
    expect(result.rushedSeconds).toMatchObject({ value: 3600 });
    expect(result.sampleCount).toMatchObject({ value: 11 });
    expect(result.provenance.sourceUpdatedAt).toBe("2023-11-14T22:13:21.000Z");
    expect(
      value(
        normalizeCompletion(
          { id: 7, game_id: 42, hastily: 0, normally: null },
          source,
        ),
      ).mainStoryMinutes,
    ).toMatchObject({ state: "missing" });
  });
  it("attaches Steam mappings only for unambiguous explicit source evidence", () => {
    expect(
      normalized().title.mappings.map((mapping) => mapping.identity),
    ).toContainEqual({ provider: "STEAM", entity: "app", id: "123456" });
    const unsupported = normalized({
      ...game,
      external_games: [
        { id: 1, uid: "123456", external_game_source: { name: "Other" } },
        {
          id: 2,
          uid: "123456garbage",
          external_game_source: { name: "Steam" },
        },
      ],
    });
    expect(unsupported.title.mappings).toHaveLength(1);
    const ambiguous = normalized({
      ...game,
      external_games: [
        ...game.external_games,
        { id: 2, uid: "456", external_game_source: { name: "Steam" } },
      ],
    });
    expect(ambiguous.title.mappings).toHaveLength(1);
    expect(value(ambiguous.game.confirmedSteamIdentities)).toHaveLength(2);
    expect(ambiguous.title.mappings).not.toContainEqual(
      expect.objectContaining({
        identity: { provider: "STEAM", entity: "app", id: "456" },
      }),
    );
  });
  it("preserves all image/video candidates without assigning screenshots or artwork as hero art", () => {
    const result = normalized();
    const media = value(result.title.media);
    expect(media).toHaveLength(4);
    expect(media.map((image) => image.sourceType)).toEqual([
      "COVER",
      "ARTWORK",
      "ARTWORK",
      "SCREENSHOT",
    ]);
    expect(media.map((image) => image.purpose)).toEqual([
      "POSTER",
      null,
      null,
      null,
    ]);
    expect(media[3]).toMatchObject({
      providerAssetId: "scexample",
      providerRecordId: "14",
      width: 1920,
      height: 1080,
    });
    expect(value(result.title.videos)).toHaveLength(2);
    expect(value(result.title.videos)[0]).toMatchObject({
      providerVideoId: "15",
      externalKey: "dQw4w9WgXcQ",
      type: { reason: "UNSUPPORTED" },
      official: { reason: "UNSUPPORTED" },
    });
    expect(
      mediaCandidateSchema.safeParse({
        ...media[0],
        owner: {
          kind: "PERSON",
          identity: { provider: "TMDB", entity: "person", id: "1" },
        },
        purpose: null,
      }).success,
    ).toBe(false);
  });
  it("retains completions for cooperative games instead of applying multiplayer heuristics", () => {
    const result = normalizeGame(gameSchema.parse(game), instant);
    result.game.completionTime = normalizeCompletion(
      completion,
      provenance(identity("game", 42), instant),
    );
    expect(gameDetailsCandidateSchema.safeParse(result).success).toBe(true);
    expect(value(result.game.completionTime).mainStoryMinutes).toMatchObject({
      value: 60,
    });
  });
  it("treats prototype-like provider values as unknown labels", () => {
    const result = normalized({
      ...game,
      game_type: { type: "constructor" },
      game_status: { status: "constructor" },
      game_modes: [{ id: 99, name: "constructor" }],
      age_ratings: [
        {
          id: 3,
          organization: { name: "constructor" },
          rating_category: { rating: "T" },
        },
      ],
    });
    expect(result.title.metadata).toMatchObject({
      gameType: "OTHER",
      releaseStatus: "UNKNOWN",
      modes: { state: "missing" },
    });
    expect(result.title.certifications).toMatchObject({
      state: "missing",
      reason: "UNSUPPORTED",
    });
  });
});
