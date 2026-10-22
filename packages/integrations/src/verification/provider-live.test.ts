import { describe, expect, it } from "vitest";

import { titleDetailsCandidateSchema } from "../catalogue-candidates.js";
import { gameDetailsCandidateSchema } from "../game-candidates.js";
import { gameEnrichmentResultSchema } from "../game-supplements.js";
import { createIgdbAdapter } from "../providers/igdb/adapter.js";
import { createSteamAdapter } from "../providers/steam/adapter.js";
import { createTmdbAdapter } from "../providers/tmdb/adapter.js";

// Explicit opt-in only. Normal tests/CI never make live provider calls.
describe.skipIf(process.env["TOWNHAWLL_PROVIDER_SMOKE"] !== "1")(
  "bounded live provider smoke",
  () => {
    it("fetches two screen titles and two games with optional confirmed Steam enrichment", async () => {
      const requests: string[] = [];
      const fetch: typeof globalThis.fetch = (input, init) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        requests.push(url.hostname);
        if (requests.length > 12)
          throw new Error("Live provider smoke request budget exceeded.");
        return globalThis.fetch(input, init);
      };
      const dependencies = { fetch };
      const tmdb = createTmdbAdapter(
        { http: { maxAttempts: 1 } },
        dependencies,
      );
      const igdb = createIgdbAdapter(
        { http: { maxAttempts: 1 } },
        dependencies,
      );
      const steam = createSteamAdapter(
        { http: { maxAttempts: 1 } },
        dependencies,
      );
      for (const [kind, id] of [
        ["MOVIE", "254"],
        ["SERIES", "30991"],
      ] as const) {
        const candidate =
          kind === "MOVIE"
            ? await tmdb.getMovie(id, { peopleLimit: 1 })
            : await tmdb.getSeries(id, { peopleLimit: 1 });
        expect(titleDetailsCandidateSchema.safeParse(candidate).success).toBe(
          true,
        );
        expect(candidate.recommendations).toBeDefined();
        console.info(
          JSON.stringify({
            provider: "TMDB",
            type: kind,
            id,
            title: candidate.title.title,
            issues: candidate.issues.length,
          }),
        );
      }
      for (const id of ["25076", "72"]) {
        const candidate = await igdb.getGame(id, {
          includeCompletionTime: false,
        });
        if (!candidate)
          throw new Error("Representative live game is unavailable.");
        expect(gameDetailsCandidateSchema.safeParse(candidate).success).toBe(
          true,
        );
        const result = await steam.enrichGame(candidate);
        expect(gameEnrichmentResultSchema.safeParse(result).success).toBe(true);
        expect(result.candidate).toEqual(candidate);
        console.info(
          JSON.stringify({
            provider: "IGDB",
            id,
            title: candidate.title.title,
            steam: result.supplementary.state,
            issues: result.issues.length,
          }),
        );
      }
      expect(requests.filter((host) => host === "id.twitch.tv")).toHaveLength(
        1,
      );
      expect(requests.length).toBeLessThanOrEqual(12);
      console.info(
        JSON.stringify({
          event: "provider.smoke_complete",
          requests: requests.length,
        }),
      );
    }, 120_000);
  },
);
