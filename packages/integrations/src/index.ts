// Pure contracts only. Privileged transport/config require explicit server subpaths.
export * from "./contracts.js";
export * from "./catalogue-candidates.js";
export * from "./game-candidates.js";
export * from "./game-supplements.js";
export {
  providerIdentitySchema,
  providerIdentityKey,
  providerMappingKey,
  steamAppIdentitySchema,
} from "./identity.js";
export type {
  CatalogueProvider,
  ProviderIdentity,
  SteamAppIdentity,
} from "./identity.js";
