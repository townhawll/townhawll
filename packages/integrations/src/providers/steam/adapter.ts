import { createLogger } from "@townhawll/observability/logger";

import { known, missing } from "../../candidate-fields.js";
import {
  gameDetailsCandidateSchema,
  type GameDetailsCandidate,
} from "../../game-candidates.js";
import {
  gameEnrichmentResultSchema,
  gameSupplementCandidateSchema,
  type GameEnrichmentResult,
} from "../../game-supplements.js";
import {
  ProviderHttpError,
  validateProviderResponse,
} from "../../http/index.js";
import {
  providerIdentityKey,
  steamAppIdentitySchema,
  type SteamAppIdentity,
} from "../../identity.js";
import {
  createSteamClient,
  requestOptionsSchema,
  validateInput,
  type SteamClientOptions,
  type SteamRequestOptions,
} from "./client.js";
import { normalizeSteamApp } from "./normalize.js";

const enrichmentOptionsSchema = requestOptionsSchema.extend({
  identity: steamAppIdentitySchema.optional(),
});
export type SteamEnrichmentOptions = SteamRequestOptions & {
  identity?: SteamAppIdentity;
};

export function createSteamAdapter(
  options: SteamClientOptions = {},
  dependencies: {
    fetch?: typeof globalThis.fetch;
    now?: () => Date;
    logger?: Pick<ReturnType<typeof createLogger>, "warn">;
  } = {},
) {
  const client = createSteamClient(options, dependencies.fetch);
  const now = dependencies.now ?? (() => new Date());
  const logger = dependencies.logger ?? createLogger("integrations.steam");
  function report(issues: GameEnrichmentResult["issues"]) {
    for (const issue of issues)
      logger.warn(
        {
          event: "provider.supplement_unavailable",
          provider: "STEAM",
          providerEntityId: issue.identity.id,
          section: issue.section,
          code: issue.code,
        },
        "Steam supplementary data unavailable.",
      );
  }

  /** Supply a confirmed IGDB reference or trusted stored mapping, never an untrusted browser-provided ID. */
  async function getAppDetails(
    confirmedIdentity: SteamAppIdentity,
    input: SteamRequestOptions = {},
  ) {
    const identity = validateInput(steamAppIdentitySchema, confirmedIdentity);
    const values = validateInput(requestOptionsSchema, input);
    const raw = await client.getAppDetails(identity.id, values);
    // Steam does not distinguish removed, unknown and region-unavailable apps here.
    if (!raw) return null;
    const result = validateProviderResponse(
      "STEAM",
      gameSupplementCandidateSchema,
      normalizeSteamApp(raw, identity, now().toISOString(), values.countryCode),
    );
    report(result.issues);
    return result;
  }

  async function enrichGame(
    candidate: GameDetailsCandidate,
    input: SteamEnrichmentOptions = {},
  ): Promise<GameEnrichmentResult> {
    const game = validateInput(gameDetailsCandidateSchema, candidate);
    const values = validateInput(enrichmentOptionsSchema, input);
    if (game.title.identity.provider !== "IGDB")
      throw new ProviderHttpError("STEAM", "INVALID_REQUEST");
    if (values.signal?.aborted)
      throw new ProviderHttpError("STEAM", "CANCELLED");
    const references = [
      ...game.title.mappings.map((mapping) => mapping.identity),
      ...(game.game.confirmedSteamIdentities.state === "known"
        ? game.game.confirmedSteamIdentities.value
        : []),
    ].flatMap((reference) => {
      const parsed = steamAppIdentitySchema.safeParse(reference);
      return parsed.success ? [parsed.data] : [];
    });
    const identities = [
      ...new Map(
        references.map((identity) => [providerIdentityKey(identity), identity]),
      ).values(),
    ];
    const requestedIdentity = values.identity;
    if (
      requestedIdentity &&
      !identities.some(
        (identity) =>
          providerIdentityKey(identity) ===
          providerIdentityKey(requestedIdentity),
      )
    )
      throw new ProviderHttpError("STEAM", "INVALID_REQUEST");
    const identity =
      requestedIdentity ??
      (identities.length === 1 ? identities[0] : undefined);
    if (!identity)
      return {
        candidate,
        supplementary: missing(
          identities.length ? "UNSUPPORTED" : "NOT_PROVIDED",
        ),
        issues: [],
      };
    try {
      const supplementary = await getAppDetails(identity, {
        countryCode: values.countryCode,
        ...(values.signal ? { signal: values.signal } : {}),
      });
      return validateProviderResponse("STEAM", gameEnrichmentResultSchema, {
        candidate,
        supplementary: supplementary
          ? known(supplementary, supplementary.provenance)
          : missing("UNAVAILABLE"),
        issues: supplementary?.issues ?? [],
      });
    } catch (error) {
      if (
        !(error instanceof ProviderHttpError) ||
        error.code === "CANCELLED" ||
        error.code === "INVALID_REQUEST"
      )
        throw error;
      const issues: GameEnrichmentResult["issues"] = [
        { section: "game.supplementary", code: error.code, identity },
      ];
      report(issues);
      return { candidate, supplementary: missing("UNAVAILABLE"), issues };
    }
  }
  return { getAppDetails, enrichGame };
}
export type SteamAdapter = ReturnType<typeof createSteamAdapter>;
