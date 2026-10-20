import { describe, expect, it, vi } from "vitest";

import { missing } from "../candidate-fields.js";
import { createTmdbAdapter } from "../providers/tmdb/adapter.js";
import { movie } from "../providers/tmdb/fixtures.js";
import { createIgdbAdapter } from "../providers/igdb/adapter.js";
import { game } from "../providers/igdb/fixtures.js";
import { instant } from "./fixtures.js";
import { representativeFixtures } from "./representative-fixtures.js";
import { recommendCatalogueMedia } from "./index.js";

describe("provider recommendation orchestration", () => {
  it("exposes movie recommendations without changing media or adding HTTP calls", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(Response.json(movie)),
    );
    const adapter = createTmdbAdapter(
      {
        accessToken: "fixture-secret",
        selection: { preferredLanguages: ["en"] },
        http: { maxAttempts: 1 },
      },
      { fetch, now: () => new Date(instant), logger: { warn: vi.fn() } },
    );
    const result = await adapter.getMovie("254");
    expect(result.recommendations?.poster.recommended).toMatchObject({
      purpose: "POSTER",
      candidate: { providerAssetId: "/poster.jpg" },
    });
    expect(
      result.recommendations?.hero.recommended?.candidate.providerAssetId,
    ).toBe("/backdrop.jpg");
    expect(result.recommendations?.video.recommended).toBeNull();
    expect(result.recommendations?.video.alternatives).toHaveLength(1); // Generic trailer remains reviewable; behind-the-scenes is excluded.
    expect(
      result.title.media.state === "known" && result.title.media.value,
    ).toHaveLength(3);
    expect(
      result.title.videos.state === "known" && result.title.videos.value,
    ).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("exposes game cover/hero suggestions without YouTube or image fetching", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>((input) =>
      Promise.resolve(
        Response.json(
          (input instanceof Request ? input.url : String(input)).includes(
            "id.twitch.tv",
          )
            ? {
                access_token: "fixture-token",
                expires_in: 3600,
                token_type: "bearer",
              }
            : [game],
        ),
      ),
    );
    const adapter = createIgdbAdapter(
      {
        credentials: {
          clientId: "fixture-client",
          clientSecret: "fixture-secret",
        },
        http: { maxAttempts: 1 },
      },
      { fetch, now: () => new Date(instant), logger: { warn: vi.fn() } },
    );
    const result = await adapter.getGame("42", {
      includeCompletionTime: false,
    });
    expect(result?.recommendations?.poster.recommended).toMatchObject({
      purpose: "POSTER",
      candidate: { sourceType: "COVER" },
    });
    expect(result?.recommendations?.hero.recommended).toMatchObject({
      purpose: "HERO_ART",
      candidate: { sourceType: "SCREENSHOT", purpose: null },
    });
    expect(result?.recommendations?.video.recommended).toBeNull();
    expect(result?.recommendations?.video.alternatives).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("preserves missing-provider-section states and permits independent later re-evaluation", () => {
    const fixture = representativeFixtures[0];
    if (!fixture) throw new Error("Missing fixture.");
    const title = {
      ...fixture.candidate.title,
      media: missing("UNAVAILABLE"),
      videos: missing("NOT_REQUESTED"),
    };
    const result = recommendCatalogueMedia({ title });
    expect(result.hero).toMatchObject({
      recommended: null,
      alternatives: [],
      rejected: [],
      sourceState: "UNAVAILABLE",
    });
    expect(result.video.sourceState).toBe("NOT_REQUESTED");
    const withEvidence = recommendCatalogueMedia(fixture.candidate, {
      evidence: fixture.evidence,
    });
    expect(withEvidence.hero.recommended?.analysis).toBe("AVAILABLE");
    expect(fixture.candidate).not.toHaveProperty("recommendations");
  });
});
