import { z } from "zod";

import { ProviderHttpError } from "../../http/index.js";

export const externalIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .refine(
    (value) => /^[1-9]\d{0,9}$/.test(value) && BigInt(value) <= 2_147_483_647n,
  );
const gameTypeIdSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,9})$/)
  .refine(
    (value) =>
      /^(?:0|[1-9]\d{0,9})$/.test(value) && BigInt(value) <= 2_147_483_647n,
  );
const signal = z.instanceof(AbortSignal).optional();
export const searchInputSchema = z.strictObject({
  // Reject query-language delimiters rather than attempting undocumented escaping.
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((value) => !/["\\;\p{Cc}]/u.test(value)),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).max(10_000).default(0),
  platformIds: z.array(externalIdSchema).min(1).max(20).optional(),
  gameTypeIds: z.array(gameTypeIdSchema).min(1).max(20).optional(),
  signal,
});
export const detailInputSchema = z.strictObject({
  includeCompletionTime: z.boolean().default(true),
  signal,
});
export type IgdbSearchInput = z.input<typeof searchInputSchema>;
export type IgdbDetailOptions = z.input<typeof detailInputSchema>;

export function validateInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ProviderHttpError("IGDB", "INVALID_REQUEST");
  return result.data;
}

const searchFields = [
  "id",
  "name",
  "summary",
  "storyline",
  "first_release_date",
  "updated_at",
  "game_status.status",
  "game_type.type",
  "cover.id",
  "cover.image_id",
  "cover.width",
  "cover.height",
  "release_dates.id",
  "release_dates.date",
  "release_dates.date_format.format",
  "release_dates.y",
  "release_dates.m",
  "release_dates.d",
  "release_dates.human",
  "release_dates.platform.id",
  "release_dates.platform.name",
  "release_dates.release_region.region",
  "release_dates.status.name",
];
const relatedFields = [
  "dlcs",
  "expansions",
  "standalone_expansions",
  "remakes",
  "remasters",
  "expanded_games",
  "ports",
  "forks",
  "bundles",
  "parent_game",
  "version_parent",
];
export const detailFields = [
  ...searchFields,
  "alternative_names.id",
  "alternative_names.name",
  "alternative_names.comment",
  "artworks.id",
  "artworks.image_id",
  "artworks.width",
  "artworks.height",
  "screenshots.id",
  "screenshots.image_id",
  "screenshots.width",
  "screenshots.height",
  "videos.id",
  "videos.name",
  "videos.video_id",
  "genres.id",
  "genres.name",
  "themes.id",
  "themes.name",
  "keywords.id",
  "keywords.name",
  "game_modes.id",
  "game_modes.name",
  "platforms.id",
  "platforms.name",
  "platforms.abbreviation",
  "involved_companies.id",
  "involved_companies.developer",
  "involved_companies.publisher",
  "involved_companies.company.id",
  "involved_companies.company.name",
  "franchises.id",
  "franchises.name",
  "collections.id",
  "collections.name",
  "age_ratings.id",
  "age_ratings.organization.name",
  "age_ratings.rating_category.rating",
  "external_games.id",
  "external_games.uid",
  "external_games.external_game_source.name",
  ...relatedFields.flatMap((field) => [`${field}.id`, `${field}.name`]),
].join(",");

export function searchQuery(input: z.output<typeof searchInputSchema>): string {
  const filters = [
    ...(input.platformIds
      ? [`platforms = (${[...new Set(input.platformIds)].join(",")})`]
      : []),
    ...(input.gameTypeIds
      ? [`game_type = (${[...new Set(input.gameTypeIds)].join(",")})`]
      : []),
  ];
  return `fields ${searchFields.join(",")}; search "${input.query}"; ${filters.length ? `where ${filters.join(" & ")}; ` : ""}limit ${input.limit + 1}; offset ${input.offset};`;
}
