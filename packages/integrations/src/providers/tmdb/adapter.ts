import { createLogger } from "@townhawll/observability/logger";
import { validateNormalizationPolicy } from "../../normalization/ratings.js";
import {
  recommendCatalogueMedia,
  validateSelectionPolicy,
  type SelectionPolicy,
} from "../../selection/index.js";

import {
  personCandidateSchema,
  titleDetailsCandidateSchema,
  titleSearchPageSchema,
  type PersonCandidate,
  type TitleDetailsCandidate,
} from "../../catalogue-candidates.js";
import {
  ProviderHttpError,
  validateProviderResponse,
} from "../../http/index.js";
import {
  normalizeMovieSearch,
  normalizeSeriesSearch,
  normalizeTitle,
} from "./normalize.js";
import { normalizePerson } from "./people.js";
import {
  assertResponseId,
  createTmdbClient,
  detailInputSchema,
  externalIdSchema,
  movieSearchInputSchema,
  personInputSchema,
  seriesSearchInputSchema,
  validateInput,
  type MovieSearchInput,
  type SeriesSearchInput,
  type TmdbClientOptions,
  type TmdbDetailOptions,
  type TmdbPersonOptions,
} from "./client.js";
import {
  movieSchema,
  movieSearchSchema,
  personSchema,
  seriesSchema,
  seriesSearchSchema,
} from "./schemas.js";
import { missing } from "./values.js";

const movieAppend =
  "credits,keywords,alternative_titles,images,videos,release_dates,watch/providers";
const seriesAppend =
  "credits,aggregate_credits,keywords,alternative_titles,images,videos,content_ratings,watch/providers";

export function createTmdbAdapter(
  options: TmdbClientOptions & { selection?: SelectionPolicy } = {},
  dependencies: {
    fetch?: typeof globalThis.fetch;
    now?: () => Date;
    logger?: Pick<ReturnType<typeof createLogger>, "warn">;
  } = {},
) {
  const normalization = validateNormalizationPolicy(options.normalization);
  const selection = validateSelectionPolicy(options.selection);
  const client = createTmdbClient(options, dependencies.fetch);
  const now = dependencies.now ?? (() => new Date());
  const logger = dependencies.logger ?? createLogger("integrations.tmdb");

  function report(issues: TitleDetailsCandidate["issues"]) {
    for (const issue of issues)
      logger.warn(
        {
          event: "provider.section_unavailable",
          provider: "TMDB",
          section: issue.section,
          providerEntity: issue.identity.entity,
          providerEntityId: issue.identity.id,
          code: issue.code,
        },
        "TMDB supplementary data unavailable.",
      );
  }

  async function searchMovies(input: MovieSearchInput) {
    const values = validateInput(movieSearchInputSchema, input);
    const params = new URLSearchParams({
      query: values.query,
      page: String(values.page),
      language: values.language,
      include_adult: String(values.includeAdult),
    });
    if (values.region) params.set("region", values.region);
    if (values.year) params.set("year", String(values.year));
    if (values.primaryReleaseYear)
      params.set("primary_release_year", String(values.primaryReleaseYear));
    const raw = await client.request(
      "search/movie",
      params,
      movieSearchSchema,
      values.signal,
    );
    return validateProviderResponse(
      "TMDB",
      titleSearchPageSchema,
      normalizeMovieSearch(raw, now().toISOString()),
    );
  }
  async function searchSeries(input: SeriesSearchInput) {
    const values = validateInput(seriesSearchInputSchema, input);
    const params = new URLSearchParams({
      query: values.query,
      page: String(values.page),
      language: values.language,
      include_adult: String(values.includeAdult),
    });
    if (values.year) params.set("year", String(values.year));
    if (values.firstAirDateYear)
      params.set("first_air_date_year", String(values.firstAirDateYear));
    const raw = await client.request(
      "search/tv",
      params,
      seriesSearchSchema,
      values.signal,
    );
    return validateProviderResponse(
      "TMDB",
      titleSearchPageSchema,
      normalizeSeriesSearch(raw, now().toISOString()),
    );
  }
  function detailParams(values: TmdbPersonOptions, append: string) {
    const params = new URLSearchParams({ append_to_response: append });
    if (values.language) params.set("language", values.language);
    if (values.imageLanguages)
      params.set(
        "include_image_language",
        [...new Set(values.imageLanguages)].join(","),
      );
    return params;
  }
  async function fetchPerson(id: string, values: TmdbPersonOptions) {
    const raw = await client.request(
      `person/${id}`,
      detailParams(values, "images"),
      personSchema,
      values.signal,
    );
    assertResponseId(id, raw.id);
    return normalizePerson(raw, now().toISOString());
  }
  async function getPerson(
    id: string,
    input: TmdbPersonOptions = {},
  ): Promise<PersonCandidate> {
    validateInput(externalIdSchema, id);
    const values = validateInput(personInputSchema, input);
    const result = await fetchPerson(id, values);
    report(result.issues);
    return validateProviderResponse(
      "TMDB",
      personCandidateSchema,
      result.person,
    );
  }

  async function details(
    kind: "movie" | "tv",
    id: string,
    input: TmdbDetailOptions,
  ): Promise<TitleDetailsCandidate> {
    validateInput(externalIdSchema, id);
    const values = validateInput(detailInputSchema, input);
    // Includes all supplementary requests; each HTTP request retains its smaller budget.
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), 60_000);
    const signal = AbortSignal.any([
      deadline.signal,
      ...(values.signal ? [values.signal] : []),
    ]);
    try {
      const params = detailParams(
        values,
        kind === "movie" ? movieAppend : seriesAppend,
      );
      const raw =
        kind === "movie"
          ? await client.request(`movie/${id}`, params, movieSchema, signal)
          : await client.request(`tv/${id}`, params, seriesSchema, signal);
      assertResponseId(id, raw.id);
      const candidate = normalizeTitle(raw, now().toISOString(), normalization);
      const enriched = await Promise.all(
        candidate.people.slice(0, values.peopleLimit).map(
          async (
            reference,
          ): Promise<{
            person: PersonCandidate;
            issues: TitleDetailsCandidate["issues"];
          }> => {
            try {
              const result = await fetchPerson(reference.identity.id, {
                ...(values.language ? { language: values.language } : {}),
                ...(values.imageLanguages
                  ? { imageLanguages: values.imageLanguages }
                  : {}),
                signal,
              });
              return {
                person: {
                  ...result.person,
                  media:
                    result.person.media.state === "known"
                      ? result.person.media
                      : reference.media,
                },
                issues: result.issues,
              };
            } catch (error) {
              if (signal.aborted) throw error;
              if (!(error instanceof ProviderHttpError)) throw error;
              if (
                error.code === "CANCELLED" ||
                error.code === "INVALID_REQUEST"
              )
                throw error;
              return {
                person: {
                  ...reference,
                  detailStatus: "UNAVAILABLE",
                  biography: missing("UNAVAILABLE"),
                  birthday: missing("UNAVAILABLE"),
                  deathday: missing("UNAVAILABLE"),
                  placeOfBirth: missing("UNAVAILABLE"),
                },
                issues: [
                  {
                    section: "person.details",
                    code: error.code,
                    identity: reference.identity,
                  },
                ],
              };
            }
          },
        ),
      );
      // Promise.all preserves reference order; network completion order must not reorder diagnostics.
      candidate.issues.push(...enriched.flatMap((result) => result.issues));
      const enrichedPeople = new Map(
        enriched.map(({ person }) => [person.identity.id, person]),
      );
      candidate.people = candidate.people.map(
        (person) => enrichedPeople.get(person.identity.id) ?? person,
      );
      report(candidate.issues);
      return validateProviderResponse("TMDB", titleDetailsCandidateSchema, {
        ...candidate,
        recommendations: recommendCatalogueMedia(candidate, {
          policy: selection,
        }),
      });
    } catch (error) {
      if (values.signal?.aborted)
        throw new ProviderHttpError("TMDB", "CANCELLED");
      if (deadline.signal.aborted)
        throw new ProviderHttpError("TMDB", "TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timer);
      deadline.abort();
    }
  }

  async function getMovie(id: string, input: TmdbDetailOptions = {}) {
    const result = await details("movie", id, input);
    if (result.title.type !== "MOVIE")
      throw new ProviderHttpError("TMDB", "INVALID_RESPONSE");
    return { ...result, title: result.title };
  }
  async function getSeries(id: string, input: TmdbDetailOptions = {}) {
    const result = await details("tv", id, input);
    if (result.title.type !== "SERIES")
      throw new ProviderHttpError("TMDB", "INVALID_RESPONSE");
    return { ...result, title: result.title };
  }
  return { searchMovies, searchSeries, getMovie, getSeries, getPerson };
}

export type TmdbAdapter = ReturnType<typeof createTmdbAdapter>;
