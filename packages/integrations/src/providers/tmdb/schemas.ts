import { z } from "zod";

export const idSchema = z.number().int().positive().safe();
const count = z.number().int().nonnegative().safe();
const optionalText = z.string().nullish();
const date = z.union([z.literal(""), z.iso.date()]).nullish();
const imagePath = z.string().regex(/^\/[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,10}$/);
const path = imagePath.nullish();
const named = z.object({ id: idSchema, name: z.string().trim().min(1) });
const company = named.extend({ logo_path: path, origin_country: optionalText });
const image = z.object({
  file_path: imagePath,
  width: count.nullish(),
  height: count.nullish(),
  iso_639_1: optionalText,
  vote_average: z.number().finite().nullish(),
  vote_count: count.nullish(),
});
export const imagesSchema = z
  .object({
    posters: z.array(image).optional(),
    backdrops: z.array(image).optional(),
    profiles: z.array(image).optional(),
  })
  .refine(
    (value) =>
      value.posters !== undefined ||
      value.backdrops !== undefined ||
      value.profiles !== undefined,
  );
export const videosSchema = z.object({
  results: z.array(
    z.object({
      id: z.string().min(1),
      key: z.string().trim().min(1),
      name: optionalText,
      site: z.string().trim().min(1),
      type: optionalText,
      official: z.boolean().nullish(),
      iso_639_1: optionalText,
      iso_3166_1: optionalText,
      published_at: z
        .union([z.literal(""), z.iso.datetime({ offset: true })])
        .nullish(),
      size: count.nullish(),
    }),
  ),
});
export const keywordsSchema = z.union([
  z.object({ keywords: z.array(named) }),
  z.object({ results: z.array(named) }),
]);
export const aliasesSchema = z.union([
  z.object({
    titles: z.array(
      z.object({
        title: z.string(),
        iso_3166_1: optionalText,
        type: optionalText,
        iso_639_1: optionalText,
      }),
    ),
  }),
  z.object({
    results: z.array(
      z.object({
        title: z.string(),
        iso_3166_1: optionalText,
        type: optionalText,
        iso_639_1: optionalText,
      }),
    ),
  }),
]);
const personReference = named.extend({
  original_name: optionalText,
  profile_path: path,
});
const cast = personReference.extend({
  character: optionalText,
  credit_id: optionalText,
  order: count.nullish(),
  roles: z
    .array(
      z.object({
        character: optionalText,
        credit_id: optionalText,
        episode_count: count.nullish(),
      }),
    )
    .optional(),
});
const crew = personReference.extend({
  job: optionalText,
  department: optionalText,
  credit_id: optionalText,
  jobs: z
    .array(
      z.object({
        job: optionalText,
        credit_id: optionalText,
        episode_count: count.nullish(),
      }),
    )
    .optional(),
});
export const creditsSchema = z.object({
  cast: z.array(cast),
  crew: z.array(crew),
});
export const releaseDatesSchema = z.object({
  results: z.array(
    z.object({
      iso_3166_1: z.string(),
      release_dates: z.array(
        z.object({
          certification: z.string(),
          system: optionalText,
          type: count.nullish(),
          release_date: optionalText,
          note: optionalText,
          iso_639_1: optionalText,
        }),
      ),
    }),
  ),
});
export const contentRatingsSchema = z.object({
  results: z.array(
    z.object({
      iso_3166_1: z.string(),
      rating: z.string(),
      system: optionalText,
    }),
  ),
});
const watchProvider = z.object({
  provider_id: idSchema,
  provider_name: z.string().trim().min(1),
  logo_path: path,
  display_priority: count.nullish(),
});
export const watchSchema = z.object({
  results: z.record(
    z.string(),
    z.object({
      link: z.url().nullish(),
      flatrate: z.array(watchProvider).optional(),
      free: z.array(watchProvider).optional(),
      ads: z.array(watchProvider).optional(),
      rent: z.array(watchProvider).optional(),
      buy: z.array(watchProvider).optional(),
    }),
  ),
});
const common = z.object({
  id: idSchema,
  overview: optionalText,
  status: optionalText,
  original_language: optionalText,
  poster_path: path,
  backdrop_path: path,
  popularity: z.number().finite().nonnegative().nullish(),
  genres: z.array(named).nullish(),
  production_companies: z.array(company).nullish(),
  production_countries: z
    .array(z.object({ iso_3166_1: z.string(), name: optionalText }))
    .nullish(),
  spoken_languages: z
    .array(
      z.object({
        iso_639_1: z.string(),
        name: optionalText,
        english_name: optionalText,
      }),
    )
    .nullish(),
  images: z.unknown().optional(),
  videos: z.unknown().optional(),
  keywords: z.unknown().optional(),
  alternative_titles: z.unknown().optional(),
  credits: z.unknown().optional(),
  "watch/providers": z.unknown().optional(),
});
export const movieSchema = common.extend({
  title: z.string().trim().min(1),
  original_title: optionalText,
  release_date: date,
  runtime: count.nullish(),
  release_dates: z.unknown().optional(),
  belongs_to_collection: named
    .extend({ poster_path: path, backdrop_path: path })
    .nullish(),
});
export const seriesSchema = common.extend({
  name: z.string().trim().min(1),
  original_name: optionalText,
  first_air_date: date,
  last_air_date: date,
  episode_run_time: z.array(count).nullish(),
  number_of_seasons: count.nullish(),
  number_of_episodes: count.nullish(),
  origin_country: z.array(z.string()).nullish(),
  networks: z.array(company).nullish(),
  created_by: z.array(personReference).nullish(),
  aggregate_credits: z.unknown().optional(),
  content_ratings: z.unknown().optional(),
  seasons: z
    .array(
      z.object({
        id: idSchema,
        season_number: count,
        name: optionalText,
        air_date: date,
        episode_count: count.nullish(),
        poster_path: path,
      }),
    )
    .nullish(),
});
export const personSchema = personReference.extend({
  biography: optionalText,
  birthday: date,
  deathday: date,
  place_of_birth: optionalText,
  images: z.unknown().optional(),
});
const searchCommon = z.object({
  id: idSchema,
  overview: optionalText,
  poster_path: path,
  backdrop_path: path,
  original_language: optionalText,
});
export const movieSearchSchema = z.object({
  page: count.min(1),
  total_pages: count,
  total_results: count,
  results: z.array(
    searchCommon.extend({
      title: z.string().trim().min(1),
      original_title: optionalText,
      release_date: date,
    }),
  ),
});
export const seriesSearchSchema = z.object({
  page: count.min(1),
  total_pages: count,
  total_results: count,
  results: z.array(
    searchCommon.extend({
      name: z.string().trim().min(1),
      original_name: optionalText,
      first_air_date: date,
    }),
  ),
});

export type TmdbMovie = z.infer<typeof movieSchema>;
export type TmdbSeries = z.infer<typeof seriesSchema>;
export type TmdbPerson = z.infer<typeof personSchema>;
export type TmdbImages = z.infer<typeof imagesSchema>;
export type TmdbVideos = z.infer<typeof videosSchema>;
export type TmdbCredits = z.infer<typeof creditsSchema>;
export type TmdbPersonReference = z.infer<typeof personReference>;
