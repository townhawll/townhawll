import { z } from "zod";

// IDs are decimal strings: parsing them through Number can silently lose precision.
const externalId = z.string().regex(/^[1-9]\d{0,29}$/);

export const providerIdentitySchema = z.discriminatedUnion("provider", [
  z.strictObject({
    provider: z.literal("TMDB"),
    entity: z.enum([
      "movie",
      "series",
      "season",
      "person",
      "company",
      "network",
      "collection",
      "genre",
      "keyword",
      "watch_provider",
    ]),
    id: externalId,
  }),
  z.strictObject({
    provider: z.literal("IGDB"),
    entity: z.enum([
      "game",
      "company",
      "platform",
      "franchise",
      "collection",
      "genre",
      "keyword",
      "theme",
    ]),
    id: externalId,
  }),
  z.strictObject({
    provider: z.literal("STEAM"),
    entity: z.literal("app"),
    id: externalId,
  }),
]);

export type ProviderIdentity = z.infer<typeof providerIdentitySchema>;
export type CatalogueProvider = ProviderIdentity["provider"];

export const steamAppIdentitySchema = providerIdentitySchema.refine(
  (identity) =>
    identity.provider === "STEAM" &&
    identity.entity === "app" &&
    /^[1-9]\d{0,9}$/.test(identity.id) &&
    BigInt(identity.id) <= 4_294_967_295n,
  "Expected a Steam app identity with a positive unsigned 32-bit App ID.",
);
export type SteamAppIdentity = z.infer<typeof steamAppIdentitySchema>;

/** Exact identity only; never compare provider records using names or fuzzy matches. */
export function providerIdentityKey(identity: ProviderIdentity): string {
  const value = providerIdentitySchema.parse(identity);
  return `${value.provider}:${value.entity}:${value.id}`;
}

/** Scoped ID for the schema's unique (provider, providerId) mapping constraints. */
export function providerMappingKey(identity: ProviderIdentity) {
  const value = providerIdentitySchema.parse(identity);
  return {
    provider: value.provider,
    providerId: `${value.entity}:${value.id}`,
  };
}
