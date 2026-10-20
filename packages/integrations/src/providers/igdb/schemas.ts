import { z } from "zod";

const id = z.number().int().positive().max(2_147_483_647);
const count = z.number().int().nonnegative().safe();
const text = z.string().nullish();
export const referenceSchema = z.union([
  id.transform((value) => ({ id: value })),
  z.object({ id, name: text, abbreviation: text }),
]);
const references = z.array(referenceSchema).max(2000).nullish();
const image = z.object({
  id: id.optional(),
  image_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  width: count.nullish(),
  height: count.nullish(),
});
const images = z.array(image).max(2000).nullish();
export const releaseSchema = z.object({
  id,
  date: count.nullish(),
  date_format: z.object({ format: z.string() }).nullish(),
  y: z.number().int().min(1).max(9999).nullish(),
  m: z.number().int().min(0).max(12).nullish(),
  d: z.number().int().min(0).max(31).nullish(),
  human: text,
  platform: referenceSchema.nullish(),
  release_region: z.object({ region: z.string() }).nullish(),
  status: z.object({ name: z.string() }).nullish(),
});
export const gameSchema = z.object({
  id,
  name: z.string().trim().min(1),
  summary: text,
  storyline: text,
  first_release_date: count.nullish(),
  updated_at: count.nullish(),
  game_status: z.object({ status: z.string() }).nullish(),
  game_type: z.object({ type: z.string() }).nullish(),
  cover: image.nullish(),
  artworks: images,
  screenshots: images,
  videos: z
    .array(
      z.object({
        id,
        name: text,
        video_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
      }),
    )
    .max(2000)
    .nullish(),
  alternative_names: z
    .array(z.object({ id, name: z.string(), comment: text }))
    .max(2000)
    .nullish(),
  release_dates: z.array(releaseSchema).max(2000).nullish(),
  platforms: references,
  genres: references,
  themes: references,
  keywords: references,
  game_modes: references,
  franchises: references,
  collections: references,
  involved_companies: z
    .array(
      z.object({
        id,
        developer: z.boolean().nullish(),
        publisher: z.boolean().nullish(),
        company: referenceSchema.nullish(),
      }),
    )
    .max(2000)
    .nullish(),
  age_ratings: z
    .array(
      z.object({
        id,
        organization: z.object({ name: z.string() }).nullish(),
        rating_category: z.object({ rating: z.string() }).nullish(),
      }),
    )
    .max(2000)
    .nullish(),
  external_games: z
    .array(
      z.object({
        id,
        uid: text,
        external_game_source: z.object({ name: z.string() }).nullish(),
      }),
    )
    .max(2000)
    .nullish(),
  dlcs: references,
  expansions: references,
  standalone_expansions: references,
  remakes: references,
  remasters: references,
  expanded_games: references,
  ports: references,
  forks: references,
  bundles: references,
  parent_game: referenceSchema.nullish(),
  version_parent: referenceSchema.nullish(),
});
export const gamesSchema = z.array(gameSchema).max(51);
export const completionSchema = z.object({
  id,
  game_id: id,
  hastily: count.nullish(),
  normally: count.nullish(),
  completely: count.nullish(),
  count: count.nullish(),
  updated_at: count.nullish(),
});
export const completionsSchema = z.array(completionSchema).max(1);
export type IgdbGame = z.infer<typeof gameSchema>;
export type IgdbReference = z.infer<typeof referenceSchema>;
export type IgdbRelease = z.infer<typeof releaseSchema>;
export type IgdbCompletion = z.infer<typeof completionSchema>;
