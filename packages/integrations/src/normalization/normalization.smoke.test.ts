import { describe, expect, it, vi } from "vitest";

import { titleDetailsCandidateSchema } from "../catalogue-candidates.js";
import { gameDetailsCandidateSchema } from "../game-candidates.js";
import { createIgdbAdapter } from "../providers/igdb/adapter.js";
import { game, instant } from "../providers/igdb/fixtures.js";
import { createTmdbAdapter } from "../providers/tmdb/adapter.js";
import { movie, series } from "../providers/tmdb/fixtures.js";

describe("adapter normalization fixture smoke", () => {
  it("returns consistently normalized movie, series and game candidates without extra requests", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>((input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === "id.twitch.tv")
        return Promise.resolve(
          Response.json({
            access_token: "fixture-token",
            expires_in: 3600,
            token_type: "bearer",
          }),
        );
      if (url.pathname === "/3/movie/254")
        return Promise.resolve(
          Response.json({
            ...movie,
            alternative_titles: {
              titles: [
                ...movie.alternative_titles.titles,
                { title: "キング・コング", iso_639_1: "ja", iso_3166_1: "JP" },
                { title: "KingKong.exe", iso_3166_1: "US" },
              ],
            },
            genres: [...movie.genres, ...movie.genres],
          }),
        );
      if (url.pathname === "/3/tv/30991")
        return Promise.resolve(Response.json(series));
      if (url.pathname === "/v4/games")
        return Promise.resolve(
          Response.json([
            {
              ...game,
              alternative_names: [
                ...game.alternative_names,
                { id: 3, name: "冒険", comment: "Japanese title" },
              ],
            },
          ]),
        );
      throw new Error("Unexpected fixture request.");
    });
    const dependencies = {
      fetch,
      now: () => new Date(instant),
      logger: { warn: vi.fn() },
    };
    const tmdb = createTmdbAdapter(
      {
        accessToken: "fixture-secret",
        normalization: { preferredMarket: "US", fallbackMarkets: ["GB"] },
        http: { maxAttempts: 1, requestsPerSecond: 100 },
      },
      dependencies,
    );
    const igdb = createIgdbAdapter(
      {
        credentials: {
          clientId: "fixture-client",
          clientSecret: "fixture-secret",
        },
        normalization: { preferredMarket: "US" },
        http: { maxAttempts: 1 },
      },
      dependencies,
    );
    const film = await tmdb.getMovie("254");
    const show = await tmdb.getSeries("30991");
    const title = await igdb.getGame("42", { includeCompletionTime: false });
    expect(title).not.toBeNull();
    if (!title) throw new Error("Fixture game was not returned.");
    expect(titleDetailsCandidateSchema.safeParse(film).success).toBe(true);
    expect(titleDetailsCandidateSchema.safeParse(show).success).toBe(true);
    expect(gameDetailsCandidateSchema.safeParse(title).success).toBe(true);
    expect(film.title.ageRating).toMatchObject({
      certainty: "INFERRED",
      value: {
        normalizedAgeRating: "13+",
        effectiveCertificationSystem: "MPA",
      },
    });
    expect(show.title.ageRating).toMatchObject({
      value: {
        normalizedAgeRating: "18+",
        effectiveCertificationSystem: "US_TV",
      },
    });
    expect(title.title.ageRating).toMatchObject({
      value: {
        normalizedAgeRating: "13+",
        effectiveCertificationSystem: "ESRB",
        effectiveCertificationCountry: null,
      },
    });
    expect(film.title.isAnime).toMatchObject({
      value: false,
      certainty: "INFERRED",
    });
    expect(show.title.isAnime).toMatchObject({
      value: true,
      certainty: "INFERRED",
    });
    expect(title.title.isAnime).toEqual({
      state: "missing",
      reason: "UNSUPPORTED",
    });
    expect(film.title.aliases).toMatchObject({
      value: [
        {
          normalizedKey: "kong",
          sourceVariants: [{ countryCode: "US" }, { countryCode: "GB" }],
        },
        { name: "キング・コング", languageCode: "ja", countryCode: "JP" },
      ],
    });
    // An IGDB comment mentioning Japanese is not a verified language code.
    expect(title.title.aliases).toMatchObject({
      value: [{ name: "冒険", languageCode: null }],
    });
    expect(film.genres).toMatchObject({
      value: [{ identity: { provider: "TMDB", entity: "genre", id: "12" } }],
    });
    expect(show.title.type).toBe("SERIES");
    if (show.title.type !== "SERIES" || film.title.type !== "MOVIE")
      throw new Error("Unexpected fixture types.");
    expect(show.title.metadata.dubbedLanguageCodes).toEqual({
      state: "missing",
      reason: "UNSUPPORTED",
    });
    expect(film.title.metadata.dubbedLanguageCodes).toEqual({
      state: "missing",
      reason: "UNSUPPORTED",
    });
    expect(title.game.releaseStatus).toMatchObject({
      value: "RELEASED",
      certainty: "PROVIDED",
    });
    expect(film.title.primaryReleaseDate).toMatchObject({
      value: { precision: "DAY", date: movie.release_date },
    });
    expect(
      show.credits.state === "known" &&
        show.credits.value.filter((value) => value.personIdentity.id === "5"),
    ).toHaveLength(2);
    expect(
      film.title.media.state === "known" && film.title.media.value,
    ).toHaveLength(3);
    expect(
      film.title.videos.state === "known" && film.title.videos.value,
    ).toHaveLength(2);
    expect(
      title.game.relationships.state === "known" &&
        title.game.relationships.value,
    ).toHaveLength(4);
    expect(fetch).toHaveBeenCalledTimes(4); // Two appended titles, one Twitch token and one game.
  });
  it("keeps missing and unsupported metadata explicit on incomplete fixtures", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        Response.json({
          id: 254,
          title: "Unknown",
          status: "New provider status",
          release_date: "",
          original_language: "",
          release_dates: {
            results: [
              { iso_3166_1: "US", release_dates: [{ certification: "" }] },
            ],
          },
        }),
      ),
    );
    const tmdb = createTmdbAdapter(
      { accessToken: "fixture-secret", http: { maxAttempts: 1 } },
      { fetch, logger: { warn: vi.fn() }, now: () => new Date(instant) },
    );
    const result = await tmdb.getMovie("254");
    expect(result.title.primaryReleaseDate.state).toBe("missing");
    expect(result.title.isAnime.state).toBe("missing");
    expect(result.title.ageRating).toEqual({
      state: "missing",
      reason: "UNSUPPORTED",
    });
    expect(result.title.certifications).toMatchObject({
      value: [{ certification: "", country: "US", system: null }],
    });
    expect(result.sourceStatus).toMatchObject({
      value: "New provider status",
      certainty: "PROVIDED",
    });
    expect(result.title.metadata).toMatchObject({
      status: "UNKNOWN",
      originalLanguageCode: { state: "missing" },
      dubbedLanguageCodes: { state: "missing", reason: "UNSUPPORTED" },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
