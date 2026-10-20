import { afterEach, describe, expect, it, vi } from "vitest";

import { titleDetailsCandidateSchema } from "../../catalogue-candidates.js";
import type { CandidateField } from "../../contracts.js";
import { ProviderHttpError } from "../../http/index.js";
import { providerIdentityKey, providerMappingKey } from "../../identity.js";
import { createTmdbAdapter } from "./index.js";
import { movie, person, series } from "./fixtures.js";
import { normalizeTitle } from "./normalize.js";
import { movieSchema } from "./schemas.js";

const instant = "2026-10-20T12:00:00.000Z";
function value<T>(field: CandidateField<T>): T {
  expect(field.state).toBe("known");
  if (field.state !== "known") throw new Error("Expected known fixture value.");
  return field.value;
}
function setup(route: (url: URL) => unknown = () => movie) {
  const fetch = vi.fn<typeof globalThis.fetch>((input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const response = route(url);
    return Promise.resolve(
      response instanceof Response ? response : Response.json(response),
    );
  });
  const logger = { warn: vi.fn() };
  const adapter = createTmdbAdapter(
    {
      accessToken: "test-secret",
      http: { requestsPerSecond: 100, maxAttempts: 1 },
    },
    { fetch, now: () => new Date(instant), logger },
  );
  return { adapter, fetch, logger };
}
afterEach(() => {
  vi.useRealTimers();
});

describe("TMDB search", () => {
  it("searches movies with validated, encoded pagination/filter parameters", async () => {
    const { adapter, fetch } = setup((url) => {
      expect(url.pathname).toBe("/3/search/movie");
      expect(Object.fromEntries(url.searchParams)).toMatchObject({
        query: "King & Kong",
        page: "2",
        language: "fr-FR",
        year: "2005",
        primary_release_year: "2005",
        region: "FR",
        include_adult: "false",
      });
      return { page: 2, total_pages: 3, total_results: 42, results: [movie] };
    });
    const result = await adapter.searchMovies({
      query: " King & Kong ",
      page: 2,
      language: "fr-FR",
      year: 2005,
      primaryReleaseYear: 2005,
      region: "FR",
    });
    expect(result).toMatchObject({ page: 2, totalPages: 3, totalResults: 42 });
    expect(result.results[0]?.identity).toEqual({
      provider: "TMDB",
      entity: "movie",
      id: "254",
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: {
          Authorization: "Bearer test-secret",
          Accept: "application/json",
        },
        credentials: "omit",
      }),
    );
  });
  it("searches series and keeps missing dates/languages unknown", async () => {
    const { adapter } = setup((url) => {
      expect(url.pathname).toBe("/3/search/tv");
      expect(url.searchParams.get("first_air_date_year")).toBe("1998");
      return {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [
          {
            id: 254,
            name: "Unknown series",
            first_air_date: "",
            original_language: "xx",
          },
        ],
      };
    });
    const result = await adapter.searchSeries({
      query: "Unknown",
      firstAirDateYear: 1998,
    });
    expect(result.results[0]).toMatchObject({
      type: "SERIES",
      identity: { entity: "series", id: "254" },
      primaryReleaseDate: { state: "missing" },
      originalLanguageCode: { state: "missing" },
    });
  });
  it("supports genuinely empty search results", async () => {
    const { adapter } = setup(() => ({
      page: 1,
      total_pages: 0,
      total_results: 0,
      results: [],
    }));
    expect((await adapter.searchMovies({ query: "nothing" })).results).toEqual(
      [],
    );
  });
  it.each([
    { query: " " },
    { query: "test", page: 501 },
    { query: "test", language: "../../secret" },
  ])("rejects invalid search inputs before HTTP", async (input) => {
    const { adapter, fetch } = setup();
    await expect(adapter.searchMovies(input)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("TMDB title normalization", () => {
  it("retrieves a complete movie using one appended request", async () => {
    const { adapter, fetch, logger } = setup((url) => {
      expect(url.pathname).toBe("/3/movie/254");
      expect(url.searchParams.get("append_to_response")).toContain(
        "release_dates",
      );
      expect(url.searchParams.get("append_to_response")).toContain(
        "watch/providers",
      );
      return movie;
    });
    const candidate = await adapter.getMovie("254");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(titleDetailsCandidateSchema.safeParse(candidate).success).toBe(true);
    expect(candidate.title).toMatchObject({
      type: "MOVIE",
      title: "King Kong",
      metadata: {
        status: "RELEASED",
        runtimeMinutes: { value: 187 },
        productionCountryCodes: { value: ["US"] },
      },
    });
    expect(value(candidate.title.primaryReleaseDate)).toEqual({
      precision: "DAY",
      date: "2005-12-12",
    });
    expect(value(candidate.genres)[0]).toMatchObject({
      identity: { entity: "genre", id: "12" },
      name: "Adventure",
    });
    expect(value(candidate.keywords)[0]).toMatchObject({
      identity: { entity: "keyword", id: "1721" },
    });
    expect(value(candidate.franchises)[0]).toMatchObject({
      identity: { entity: "collection", id: "2936" },
    });
    expect(candidate.title).not.toHaveProperty("publicationStatus");
    expect(candidate.title).not.toHaveProperty("id");
  });

  it("normalizes series seasons, creators, networks, and runtime evidence", async () => {
    const { adapter } = setup(() => series);
    const result = await adapter.getSeries("30991");
    expect(result.title).toMatchObject({
      type: "SERIES",
      metadata: {
        status: "ENDED",
        averageEpisodeRuntime: { value: 25, certainty: "INFERRED" },
        numberOfSeasons: { value: 1 },
        numberOfEpisodes: { value: 26 },
        originCountryCodes: { value: ["JP"] },
      },
    });
    expect(value(result.sourceEpisodeRuntimes)).toEqual([24, 26]);
    const seasons = value(result.seasons);
    expect(seasons.map((season) => season.seasonNumber)).toEqual([0, 1]);
    expect(seasons[0]?.airDate).toEqual({
      state: "missing",
      reason: "NOT_PROVIDED",
    });
    expect(seasons[1]).toMatchObject({
      identity: { entity: "season", id: "92721" },
      episodeCount: { value: 26 },
      provenance: { sourceUrl: "https://www.themoviedb.org/tv/30991/season/1" },
    });
    expect(value(seasons[1]!.media)[0]).toMatchObject({
      owner: { kind: "SEASON", identity: { id: "92721" } },
      purpose: "POSTER",
      providerAssetId: "/season.jpg",
    });
    const companies = value(result.companies);
    expect(
      companies.map((company) => providerMappingKey(company.identity)),
    ).toEqual([
      { provider: "TMDB", providerId: "company:12" },
      { provider: "TMDB", providerId: "network:12" },
    ]);
    expect(result.title.isAnime).toMatchObject({
      state: "known",
      value: true,
      certainty: "INFERRED",
    });
    expect(result.franchises).toEqual({
      state: "missing",
      reason: "UNSUPPORTED",
    });
  });

  it("preserves original status and certification values without guessing authority or age bucket", async () => {
    const { adapter } = setup(() => ({
      ...movie,
      status: "Future TMDB status",
    }));
    const result = await adapter.getMovie("254");
    expect(result.title.metadata.status).toBe("UNKNOWN");
    expect(value(result.sourceStatus)).toBe("Future TMDB status");
    expect(value(result.title.certifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          certification: "PG-13",
          country: "US",
          system: null,
          releaseType: 3,
          sourceReleaseDate: "2005-12-14T00:00:00Z",
        }),
        expect.objectContaining({
          certification: "UA",
          country: "IN",
          system: "CBFC",
        }),
      ]),
    );
    expect(result.title).not.toHaveProperty("normalizedAgeRating");
  });

  it("does not infer dubbing from spoken languages or video audio from a provider label", async () => {
    const { adapter } = setup();
    const result = await adapter.getMovie("254");
    expect(value(result.sourceSpokenLanguageCodes)).toEqual(["en", "fr"]);
    expect(result.title.metadata).toHaveProperty(
      "originalLanguageCode.value",
      "en",
    );
    expect(result.title.metadata.dubbedLanguageCodes).toEqual({
      state: "missing",
      reason: "UNSUPPORTED",
    });
    expect(value(result.title.videos)[0]).toMatchObject({
      providerLanguageCode: "en",
      languageCode: { state: "missing", reason: "UNSUPPORTED" },
    });
  });

  it("preserves all legitimate person roles and multiple directors", async () => {
    const { adapter } = setup();
    const movieResult = await adapter.getMovie("254");
    expect(
      value(movieResult.credits).filter((credit) => credit.job === "Director"),
    ).toHaveLength(2);
    expect(
      value(movieResult.credits)
        .filter((credit) => credit.personIdentity.id === "2")
        .map((credit) => credit.job),
    ).toEqual(["Director", "Writer"]);
    const { adapter: seriesAdapter } = setup(() => series);
    const seriesResult = await seriesAdapter.getSeries("30991");
    const credits = value(seriesResult.credits);
    expect(
      credits
        .filter((credit) => credit.personIdentity.id === "4")
        .map((credit) => credit.job),
    ).toEqual(["Director", "Series Director", "Creator"]);
    expect(
      credits
        .filter((credit) => credit.personIdentity.id === "5")
        .map((credit) => credit.characterName),
    ).toEqual(["Spike", "Other"]);
    expect(
      seriesResult.people.filter((entry) => entry.identity.id === "4"),
    ).toHaveLength(1);
  });

  it("extracts unranked media and videos with source metadata and provenance", async () => {
    const { adapter } = setup();
    const result = await adapter.getMovie("254");
    const media = value(result.title.media);
    expect(media).toHaveLength(3);
    expect(media[0]).toMatchObject({
      purpose: "POSTER",
      width: 1000,
      height: 1500,
      providerPrimary: true,
      providerAssetId: "/poster.jpg",
      languageCode: "en",
      provenance: { fetchedAt: instant },
    });
    expect(
      media.every(
        (image) =>
          !Object.hasOwn(image, "selected") &&
          !Object.hasOwn(image, "objectKey"),
      ),
    ).toBe(true);
    const videos = value(result.title.videos);
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({
      sourceType: "Trailer",
      type: { value: "TRAILER" },
      official: { value: true },
      resolution: 1080,
    });
    expect(videos[1]).toMatchObject({
      platform: "Vimeo",
      sourceType: "Behind the Scenes",
      type: { value: "OTHER" },
    });
  });

  it("keeps alias country separate from language and deduplicates normalized keys", async () => {
    const { adapter } = setup();
    const aliases = value((await adapter.getMovie("254")).title.aliases);
    expect(aliases).toHaveLength(1);
    expect(aliases[0]).toMatchObject({
      name: "Kong",
      normalizedKey: "kong",
      languageCode: null,
      countryCode: null,
      sourceType: "Working title",
      sourceVariants: [
        {
          name: "Kong",
          countryCode: "US",
          languageCode: null,
          sourceType: "Working title",
        },
        {
          name: "KONG",
          countryCode: "GB",
          languageCode: null,
          sourceType: null,
        },
      ],
    });
  });

  it("keeps all regional access modes and the real TMDB watch link", async () => {
    const { adapter } = setup();
    const availability = value((await adapter.getMovie("254")).watchProviders);
    expect(
      availability.map((entry) => [entry.regionCode, entry.accessType]),
    ).toEqual([
      ["US", "SUBSCRIPTION"],
      ["US", "RENT"],
      ["IN", "BUY"],
    ]);
    expect(availability[0]).toMatchObject({
      identity: { entity: "watch_provider", id: "8" },
      attribution: "JustWatch",
      sourceUrl: "https://www.themoviedb.org/movie/254/watch?locale=US",
    });
  });

  it("accepts incomplete details while keeping absent and failed sections explicit", async () => {
    const { adapter, logger } = setup(() => ({
      id: 7,
      title: "Unannounced",
      status: null,
      release_date: "",
      original_language: null,
      images: { status_code: 25 },
    }));
    const result = await adapter.getMovie("7");
    expect(result.title.metadata.status).toBe("UNKNOWN");
    expect(result.title.primaryReleaseDate.state).toBe("missing");
    expect(result.title.videos).toEqual({
      state: "missing",
      reason: "UNAVAILABLE",
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({ section: "images", code: "INVALID_RESPONSE" }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ section: "videos", code: "MISSING_SECTION" }),
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("test-secret");
  });

  it("retains primary artwork when the optional images section is unavailable", async () => {
    const { images: _images, ...withoutImages } = movie;
    const { adapter } = setup(() => withoutImages);
    const result = await adapter.getMovie("254");
    expect(value(result.title.media)).toHaveLength(2);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ section: "images", code: "MISSING_SECTION" }),
    );
  });

  it("keeps pure normalization independent from HTTP, config and Prisma", () => {
    expect(normalizeTitle(movieSchema.parse(movie), instant).title.type).toBe(
      "MOVIE",
    );
  });

  it("accepts incomplete series without inventing runtimes, counts or seasons", async () => {
    const { adapter } = setup(() => ({
      id: 22,
      name: "A pilot",
      status: "Pilot",
      first_air_date: null,
      episode_run_time: [0],
      original_language: "und",
    }));
    const result = await adapter.getSeries("22");
    expect(result.title.metadata.status).toBe("UNKNOWN");
    expect(result.title.metadata.averageEpisodeRuntime.state).toBe("missing");
    expect(result.title.metadata.numberOfEpisodes.state).toBe("missing");
    expect(result.title.metadata.originalLanguageCode.state).toBe("missing");
    expect(result.seasons.state).toBe("missing");
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        section: "aggregate_credits",
        code: "MISSING_SECTION",
      }),
    );
  });

  it("retains valid direct credits if aggregate credits fail independently", async () => {
    const { adapter } = setup(() => ({
      ...series,
      aggregate_credits: { status_code: 25 },
    }));
    const result = await adapter.getSeries("30991");
    expect(value(result.credits).map((credit) => credit.job)).toEqual([
      "Series Director",
      "Creator",
    ]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        section: "aggregate_credits",
        code: "INVALID_RESPONSE",
      }),
    );
  });
});

describe("TMDB people and supplementary requests", () => {
  it("fetches complete person details without truncating a biography", async () => {
    const { adapter } = setup((url) => {
      expect(url.pathname).toBe("/3/person/1");
      expect(url.searchParams.get("append_to_response")).toBe("images");
      return person;
    });
    const result = await adapter.getPerson("1");
    expect(value(result.biography)).toBe(person.biography.trim());
    expect(value(result.biography).length).toBeGreaterThan(360);
    expect(value(result.birthday)).toBe("1968-09-28");
    expect(result.deathday.state).toBe("missing");
    expect(value(result.media)[0]).toMatchObject({
      owner: { kind: "PERSON", identity: { id: "1" } },
      purpose: "PERSON_IMAGE",
      width: 400,
    });
  });

  it("only fetches the explicitly bounded number of people", async () => {
    const { adapter, fetch } = setup((url) =>
      url.pathname.startsWith("/3/person/") ? person : movie,
    );
    const result = await adapter.getMovie("254", { peopleLimit: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.people[0]?.detailStatus).toBe("AVAILABLE");
    expect(
      result.people
        .slice(1)
        .every((entry) => entry.detailStatus === "NOT_REQUESTED"),
    ).toBe(true);
    await expect(
      adapter.getMovie("254", { peopleLimit: 11 }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("preserves useful title data and reports failed person enrichment safely", async () => {
    const { adapter, logger } = setup((url) =>
      url.pathname.startsWith("/3/person/")
        ? new Response("private response", { status: 503 })
        : movie,
    );
    const result = await adapter.getMovie("254", { peopleLimit: 1 });
    expect(result.title.title).toBe("King Kong");
    expect(result.people[0]).toMatchObject({
      detailStatus: "UNAVAILABLE",
      biography: { state: "missing", reason: "UNAVAILABLE" },
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        section: "person.details",
        code: "HTTP",
        identity: { provider: "TMDB", entity: "person", id: "1" },
      }),
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(
      /private response|test-secret/,
    );
  });

  it("retains supplementary-response ID integrity", async () => {
    const { adapter } = setup((url) =>
      url.pathname.startsWith("/3/person/") ? { ...person, id: 99 } : movie,
    );
    const result = await adapter.getMovie("254", { peopleLimit: 1 });
    expect(result.people[0]?.identity.id).toBe("1");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "INVALID_RESPONSE" }),
    );
  });

  it("caps person requests at ten and deduplicates repeated person references", async () => {
    vi.useFakeTimers();
    const { adapter, fetch } = setup((url) => {
      if (url.pathname.startsWith("/3/person/"))
        return { ...person, id: Number(url.pathname.split("/").at(-1)) };
      return {
        ...movie,
        credits: {
          cast: Array.from({ length: 25 }, (_, index) => ({
            id: index + 1,
            name: `Actor ${index + 1}`,
            character: "Character",
            order: index,
          })),
          crew: [{ id: 1, name: "Actor 1", job: "Director" }],
        },
      };
    });
    const result = adapter.getMovie("254", { peopleLimit: 10 });
    await vi.runAllTimersAsync();
    const candidate = await result;
    expect(fetch).toHaveBeenCalledTimes(11);
    expect(
      candidate.people.filter((entry) => entry.detailStatus === "AVAILABLE"),
    ).toHaveLength(10);
    expect(candidate.people).toHaveLength(25);
  });
});

describe("TMDB validation and transport failures", () => {
  it.each(["0", "-1", "01", "movie:254", "../../person/1", "2147483648"])(
    "rejects an invalid TMDB ID before HTTP: %s",
    async (id) => {
      const { adapter, fetch } = setup();
      await expect(adapter.getMovie(id)).rejects.toMatchObject({
        code: "INVALID_REQUEST",
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each([
    { id: 254 },
    { ...movie, runtime: "long" },
    { ...movie, release_date: "2005" },
    { ...movie, id: 255 },
  ])("rejects malformed or mismatched core responses", async (payload) => {
    const { adapter } = setup(() => payload);
    await expect(adapter.getMovie("254")).rejects.toBeInstanceOf(
      ProviderHttpError,
    );
    await expect(adapter.getMovie("254")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it.each([401, 404, 429, 503])(
    "preserves typed HTTP failures: %i",
    async (status) => {
      const { adapter } = setup(
        () => new Response("sensitive provider error", { status }),
      );
      await expect(adapter.getMovie("254")).rejects.toMatchObject({
        code: "HTTP",
        status,
      });
    },
  );
  it("preserves provider scopes even when numeric IDs collide", async () => {
    const movieAdapter = setup().adapter;
    const seriesAdapter = setup(() => ({ ...series, id: 254 })).adapter;
    expect(
      providerIdentityKey((await movieAdapter.getMovie("254")).title.identity),
    ).toBe("TMDB:movie:254");
    expect(
      providerIdentityKey(
        (await seriesAdapter.getSeries("254")).title.identity,
      ),
    ).toBe("TMDB:series:254");
  });
  it("honors caller cancellation", async () => {
    const { adapter, fetch } = setup();
    await expect(
      adapter.getMovie("254", { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed search and person payloads", async () => {
    const { adapter } = setup(() => ({
      page: 1,
      total_pages: 1,
      total_results: 1,
      results: [{ id: 1, title: 3 }],
    }));
    await expect(adapter.searchMovies({ query: "test" })).rejects.toMatchObject(
      { code: "INVALID_RESPONSE" },
    );
    await expect(adapter.getPerson("1")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it("caps the whole enrichment operation with a shared deadline", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const adapter = createTmdbAdapter(
      {
        accessToken: "test",
        http: { timeoutMs: 120_000, totalTimeoutMs: 120_000, maxAttempts: 1 },
      },
      { fetch, logger: { warn: vi.fn() } },
    );
    const check = expect(adapter.getMovie("254")).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await check;
    expect(vi.getTimerCount()).toBe(0);
  });
});
