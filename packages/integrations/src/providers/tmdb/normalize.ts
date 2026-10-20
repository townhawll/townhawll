import { z } from "zod";

import type {
  TitleDetailsCandidate,
  TitleSearchPage,
  SeasonCandidate,
} from "../../catalogue-candidates.js";
import {
  sourceUrlSchema,
  type CandidateField,
  type Provenance,
  type TitleCandidate,
} from "../../contracts.js";
import { normalizeImages, normalizeVideos } from "./media.js";
import { normalizeCredits } from "./people.js";
import {
  aliasesSchema,
  contentRatingsSchema,
  imagesSchema,
  keywordsSchema,
  movieSearchSchema,
  releaseDatesSchema,
  seriesSearchSchema,
  videosSchema,
  watchSchema,
  type TmdbMovie,
  type TmdbSeries,
} from "./schemas.js";
import {
  clean,
  country,
  field,
  imageUrl,
  known,
  language,
  mapField,
  missing,
  provenance,
  section,
  tmdbIdentity,
  type NormalizationContext,
} from "./values.js";

function aliasKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
function normalizeAliases(
  raw: unknown,
  names: string[],
  context: NormalizationContext,
) {
  return mapField(
    section(aliasesSchema, raw, "alternative_titles", context),
    (data) => {
      const seen = new Set(names.map(aliasKey));
      return ("titles" in data ? data.titles : data.results).flatMap(
        (alias) => {
          const name = clean(alias.title);
          const key = name ? aliasKey(name) : "";
          if (!name || !key || seen.has(key)) return [];
          seen.add(key);
          return [
            {
              name,
              normalizedKey: key,
              languageCode: null,
              countryCode: country(alias.iso_3166_1),
              sourceType: clean(alias.type),
              provenance: context.provenance,
            },
          ];
        },
      );
    },
  );
}

function normalizeCertifications(
  data: TmdbMovie | TmdbSeries,
  context: NormalizationContext,
) {
  if ("title" in data) {
    return mapField(
      section(releaseDatesSchema, data.release_dates, "release_dates", context),
      (value) =>
        value.results.flatMap((region) =>
          region.release_dates.flatMap((release) => {
            const certification = clean(release.certification);
            return certification
              ? [
                  {
                    certification,
                    system: clean(release.system),
                    country: country(region.iso_3166_1),
                    releaseType: release.type ?? null,
                    sourceReleaseDate: release.release_date ?? null,
                    note: release.note ?? null,
                    languageCode: language(release.iso_639_1),
                    provenance: context.provenance,
                  },
                ]
              : [];
          }),
        ),
    );
  }
  return mapField(
    section(
      contentRatingsSchema,
      data.content_ratings,
      "content_ratings",
      context,
    ),
    (value) =>
      value.results.flatMap((rating) => {
        const certification = clean(rating.rating);
        return certification
          ? [
              {
                certification,
                system: clean(rating.system),
                country: country(rating.iso_3166_1),
                provenance: context.provenance,
              },
            ]
          : [];
      }),
  );
}

function normalizeWatchProviders(
  raw: unknown,
  context: NormalizationContext,
): TitleDetailsCandidate["watchProviders"] {
  return mapField(
    section(watchSchema, raw, "watch/providers", context),
    (data) => {
      const results: Extract<
        TitleDetailsCandidate["watchProviders"],
        { state: "known" }
      >["value"] = [];
      const seen = new Set<string>();
      for (const [region, availability] of Object.entries(data.results)) {
        const regionCode = country(region);
        if (!regionCode) continue;
        const groups = [
          ["SUBSCRIPTION", availability.flatrate],
          ["FREE", availability.free],
          ["ADS", availability.ads],
          ["RENT", availability.rent],
          ["BUY", availability.buy],
        ] as const;
        for (const [accessType, providers] of groups)
          for (const provider of providers ?? []) {
            const key = `${regionCode}:${accessType}:${provider.provider_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({
              identity: tmdbIdentity("watch_provider", provider.provider_id),
              name: provider.provider_name,
              regionCode,
              accessType,
              sourceUrl: sourceUrlSchema.safeParse(availability.link).success
                ? (availability.link ?? null)
                : null,
              logoUrl: imageUrl(provider.logo_path),
              displayPriority: provider.display_priority ?? null,
              attribution: "JustWatch",
              provenance: context.provenance,
            });
          }
      }
      return results;
    },
  );
}

function normalizeSeasons(
  data: TmdbSeries,
  context: NormalizationContext,
): TitleDetailsCandidate["seasons"] {
  if (!data.seasons) return missing();
  const seasons: SeasonCandidate[] = data.seasons.map((season) => {
    const identity = tmdbIdentity("season", season.id);
    const source: Provenance = {
      ...context.provenance,
      identity,
      sourceUrl: `${context.provenance.sourceUrl}/season/${season.season_number}`,
    };
    return {
      identity,
      seriesIdentity: context.provenance.identity,
      seasonNumber: season.season_number,
      name: clean(season.name),
      airDate: field(clean(season.air_date), source),
      episodeCount: field(season.episode_count, source),
      media: normalizeImages(
        known({ posters: [] }, source),
        { kind: "SEASON", identity },
        source,
        { poster: season.poster_path },
      ),
      provenance: source,
    };
  });
  return known(seasons, context.provenance);
}

function movieStatus(
  status: string | null | undefined,
): Extract<TitleCandidate, { type: "MOVIE" }>["metadata"]["status"] {
  switch (status) {
    case "Planned":
      return "PLANNED";
    case "In Production":
      return "IN_PRODUCTION";
    case "Post Production":
      return "POST_PRODUCTION";
    case "Released":
      return "RELEASED";
    case "Canceled":
      return "CANCELED";
    default:
      return "UNKNOWN";
  }
}
function seriesStatus(
  status: string | null | undefined,
): Extract<TitleCandidate, { type: "SERIES" }>["metadata"]["status"] {
  switch (status) {
    case "Returning Series":
      return "RETURNING";
    case "Ended":
      return "ENDED";
    case "Canceled":
      return "CANCELED";
    case "In Production":
      return "IN_PRODUCTION";
    case "Planned":
      return "PLANNED";
    default:
      return "UNKNOWN";
  }
}
function episodeRuntime(
  values: number[] | null | undefined,
  source: Provenance,
): CandidateField<number> {
  const positive = values?.filter((value) => value > 0) ?? [];
  if (!positive.length) return missing();
  const average = Math.round(
    positive.reduce((total, value) => total + value, 0) / positive.length,
  );
  const result = known(average, source);
  return positive.length === 1
    ? result
    : {
        state: "known",
        value: average,
        certainty: "INFERRED",
        evidence: ["Arithmetic mean of positive TMDB episode_run_time values."],
        provenance: source,
      };
}

export function normalizeTitle(
  data: TmdbMovie | TmdbSeries,
  fetchedAt: string,
): TitleDetailsCandidate {
  const movie = "title" in data;
  const identity = tmdbIdentity(movie ? "movie" : "series", data.id);
  const source = provenance(identity, fetchedAt);
  const context: NormalizationContext = { provenance: source, issues: [] };
  const name = movie ? data.title : data.name;
  const original = clean(movie ? data.original_title : data.original_name);
  const credits = normalizeCredits(
    data.credits,
    movie ? undefined : data.aggregate_credits,
    movie ? undefined : data.created_by,
    context,
    !movie,
  );
  const base = {
    identity,
    mappings: [source],
    title: name,
    originalTitle: field(original, source),
    overview: field(clean(data.overview), source),
    primaryReleaseDate: clean(movie ? data.release_date : data.first_air_date)
      ? known(
          {
            precision: "DAY" as const,
            date: (movie ? data.release_date : data.first_air_date) ?? "",
          },
          source,
        )
      : missing(),
    isAnime: missing("UNSUPPORTED"),
    aliases: normalizeAliases(
      data.alternative_titles,
      [name, original ?? name],
      context,
    ),
    certifications: normalizeCertifications(data, context),
    media: normalizeImages(
      section(imagesSchema, data.images, "images", context),
      { kind: "TITLE", identity },
      source,
      { poster: data.poster_path, backdrop: data.backdrop_path },
    ),
    videos: normalizeVideos(
      section(videosSchema, data.videos, "videos", context),
      source,
    ),
  };
  const title: TitleCandidate = movie
    ? {
        ...base,
        type: "MOVIE",
        metadata: {
          status: movieStatus(data.status),
          runtimeMinutes: field(
            data.runtime && data.runtime > 0 ? data.runtime : null,
            source,
          ),
          originalLanguageCode: field(language(data.original_language), source),
          dubbedLanguageCodes: missing("UNSUPPORTED"),
          productionCountryCodes: field(
            data.production_countries?.flatMap(
              (value) => country(value.iso_3166_1) ?? [],
            ),
            source,
          ),
        },
      }
    : {
        ...base,
        type: "SERIES",
        metadata: {
          status: seriesStatus(data.status),
          lastAirDate: field(clean(data.last_air_date), source),
          averageEpisodeRuntime: episodeRuntime(data.episode_run_time, source),
          numberOfSeasons: field(data.number_of_seasons, source),
          numberOfEpisodes: field(data.number_of_episodes, source),
          originalLanguageCode: field(language(data.original_language), source),
          dubbedLanguageCodes: missing("UNSUPPORTED"),
          originCountryCodes: field(
            data.origin_country?.flatMap((value) => country(value) ?? []),
            source,
          ),
        },
      };
  const companies: Extract<
    TitleDetailsCandidate["companies"],
    { state: "known" }
  >["value"] = [];
  for (const [role, values] of [
    ["PRODUCTION_COMPANY", data.production_companies],
    ["NETWORK", movie ? undefined : data.networks],
  ] as const) {
    for (const company of values ?? [])
      companies.push({
        identity: tmdbIdentity(
          role === "NETWORK" ? "network" : "company",
          company.id,
        ),
        name: company.name,
        role,
        countryCode: country(company.origin_country),
        logoUrl: imageUrl(company.logo_path),
        provenance: source,
      });
  }
  return {
    title,
    genres: field(
      data.genres?.map((genre) => ({
        identity: tmdbIdentity("genre", genre.id),
        name: genre.name,
        provenance: source,
      })),
      source,
    ),
    keywords: mapField(
      section(keywordsSchema, data.keywords, "keywords", context),
      (value) =>
        ("keywords" in value ? value.keywords : value.results).map(
          (keyword) => ({
            identity: tmdbIdentity("keyword", keyword.id),
            name: keyword.name,
            provenance: source,
          }),
        ),
    ),
    ...credits,
    companies:
      (data.production_companies !== undefined &&
        data.production_companies !== null) ||
      (!movie && data.networks !== undefined && data.networks !== null)
        ? known(companies, source)
        : missing(),
    franchises: movie
      ? data.belongs_to_collection === undefined
        ? missing()
        : known(
            data.belongs_to_collection
              ? [
                  {
                    identity: tmdbIdentity(
                      "collection",
                      data.belongs_to_collection.id,
                    ),
                    name: data.belongs_to_collection.name,
                    provenance: source,
                  },
                ]
              : [],
            source,
          )
      : missing("UNSUPPORTED"),
    seasons: movie ? missing("UNSUPPORTED") : normalizeSeasons(data, context),
    watchProviders: normalizeWatchProviders(data["watch/providers"], context),
    sourceStatus: field(clean(data.status), source),
    sourceSpokenLanguageCodes: field(
      data.spoken_languages?.flatMap(
        (value) => language(value.iso_639_1) ?? [],
      ),
      source,
    ),
    sourceEpisodeRuntimes: movie
      ? missing("UNSUPPORTED")
      : field(data.episode_run_time, source),
    providerPopularity: field(data.popularity, source),
    issues: context.issues,
  };
}

export function normalizeMovieSearch(
  data: z.infer<typeof movieSearchSchema>,
  fetchedAt: string,
): TitleSearchPage {
  return {
    page: data.page,
    totalPages: data.total_pages,
    totalResults: data.total_results,
    results: data.results.map((result) => {
      const identity = tmdbIdentity("movie", result.id);
      const source = provenance(identity, fetchedAt);
      const media = normalizeImages(
        known({}, source),
        { kind: "TITLE", identity },
        source,
        { poster: result.poster_path, backdrop: result.backdrop_path },
      );
      return {
        identity,
        type: "MOVIE",
        title: result.title,
        originalTitle: field(clean(result.original_title), source),
        overview: field(clean(result.overview), source),
        primaryReleaseDate: result.release_date
          ? known({ precision: "DAY", date: result.release_date }, source)
          : missing(),
        originalLanguageCode: field(language(result.original_language), source),
        media: media.state === "known" ? media.value : [],
        provenance: source,
      };
    }),
  };
}
export function normalizeSeriesSearch(
  data: z.infer<typeof seriesSearchSchema>,
  fetchedAt: string,
): TitleSearchPage {
  return {
    page: data.page,
    totalPages: data.total_pages,
    totalResults: data.total_results,
    results: data.results.map((result) => {
      const identity = tmdbIdentity("series", result.id);
      const source = provenance(identity, fetchedAt);
      const media = normalizeImages(
        known({}, source),
        { kind: "TITLE", identity },
        source,
        { poster: result.poster_path, backdrop: result.backdrop_path },
      );
      return {
        identity,
        type: "SERIES",
        title: result.name,
        originalTitle: field(clean(result.original_name), source),
        overview: field(clean(result.overview), source),
        primaryReleaseDate: result.first_air_date
          ? known({ precision: "DAY", date: result.first_air_date }, source)
          : missing(),
        originalLanguageCode: field(language(result.original_language), source),
        media: media.state === "known" ? media.value : [],
        provenance: source,
      };
    }),
  };
}
