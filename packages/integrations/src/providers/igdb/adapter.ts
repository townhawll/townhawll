import { createLogger } from "@townhawll/observability/logger";

import {
  gameDetailsCandidateSchema,
  gameSearchPageSchema,
} from "../../game-candidates.js";
import {
  ProviderHttpError,
  validateProviderResponse,
} from "../../http/index.js";
import { createIgdbClient, type IgdbClientOptions } from "./client.js";
import { normalizeCompletion, normalizeGame } from "./normalize.js";
import {
  detailFields,
  detailInputSchema,
  externalIdSchema,
  searchInputSchema,
  searchQuery,
  validateInput,
  type IgdbDetailOptions,
  type IgdbSearchInput,
} from "./queries.js";
import { completionsSchema, gamesSchema } from "./schemas.js";
import { missing } from "./values.js";

export function createIgdbAdapter(
  options: IgdbClientOptions = {},
  dependencies: {
    fetch?: typeof globalThis.fetch;
    now?: () => Date;
    logger?: Pick<ReturnType<typeof createLogger>, "warn">;
  } = {},
) {
  const now = dependencies.now ?? (() => new Date());
  const client = createIgdbClient(options, {
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
    now: () => now().getTime(),
  });
  const logger = dependencies.logger ?? createLogger("integrations.igdb");
  async function operation<T>(
    signal: AbortSignal | undefined,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), 60_000);
    try {
      return await run(
        AbortSignal.any([deadline.signal, ...(signal ? [signal] : [])]),
      );
    } catch (error) {
      if (signal?.aborted) throw new ProviderHttpError("IGDB", "CANCELLED");
      if (deadline.signal.aborted)
        throw new ProviderHttpError("IGDB", "TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timer);
      deadline.abort();
    }
  }
  async function searchGames(input: IgdbSearchInput) {
    const values = validateInput(searchInputSchema, input);
    return operation(values.signal, async (signal) => {
      const games = await client.request(
        "games",
        searchQuery(values),
        gamesSchema,
        signal,
      );
      if (games.length > values.limit + 1)
        throw new ProviderHttpError("IGDB", "INVALID_RESPONSE");
      return validateProviderResponse("IGDB", gameSearchPageSchema, {
        offset: values.offset,
        limit: values.limit,
        nextOffset:
          games.length > values.limit && values.offset + values.limit <= 10_000
            ? values.offset + values.limit
            : null,
        results: games
          .slice(0, values.limit)
          .map((game) => normalizeGame(game, now().toISOString()).title),
      });
    });
  }
  async function getGame(id: string, input: IgdbDetailOptions = {}) {
    validateInput(externalIdSchema, id);
    const values = validateInput(detailInputSchema, input);
    return operation(values.signal, async (signal) => {
      const games = await client.request(
        "games",
        `fields ${detailFields}; where id = ${id}; limit 1;`,
        gamesSchema,
        signal,
      );
      if (!games.length) return null;
      const game = games[0];
      if (games.length !== 1 || !game || String(game.id) !== id)
        throw new ProviderHttpError("IGDB", "INVALID_RESPONSE");
      const result = normalizeGame(game, now().toISOString());
      const source = result.title.mappings[0];
      if (!source) throw new ProviderHttpError("IGDB", "INVALID_RESPONSE");
      if (values.includeCompletionTime) {
        try {
          const times = await client.request(
            "game_time_to_beats",
            `fields id,game_id,hastily,normally,completely,count,updated_at; where game_id = ${id}; limit 1;`,
            completionsSchema,
            signal,
          );
          const time = times[0];
          if (time && String(time.game_id) !== id)
            throw new ProviderHttpError("IGDB", "INVALID_RESPONSE");
          result.game.completionTime = time
            ? normalizeCompletion(time, source)
            : missing();
        } catch (error) {
          if (
            signal.aborted ||
            !(error instanceof ProviderHttpError) ||
            error.code === "CANCELLED" ||
            error.code === "INVALID_REQUEST"
          )
            throw error;
          result.game.completionTime = missing("UNAVAILABLE");
          result.issues.push({
            section: "completionTime",
            code: error.code,
            identity: result.title.identity,
          });
          logger.warn(
            {
              event: "provider.section_unavailable",
              provider: "IGDB",
              section: "completionTime",
              providerEntityId: id,
              code: error.code,
              status: error.status,
            },
            "IGDB supplementary data unavailable.",
          );
        }
      }
      return validateProviderResponse(
        "IGDB",
        gameDetailsCandidateSchema,
        result,
      );
    });
  }
  return { searchGames, getGame };
}
export type IgdbAdapter = ReturnType<typeof createIgdbAdapter>;
