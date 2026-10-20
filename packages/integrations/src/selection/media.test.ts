import { describe, expect, it } from "vitest";

import { mediaSelectionSchema } from "./contracts.js";
import { rankMediaCandidates } from "./media.js";
import {
  gameContext,
  image,
  inspection,
  movieContext,
  scene,
  source,
} from "./fixtures.js";
import { mediaCandidateKey, validateSelectionEvidence } from "./evidence.js";

describe("media eligibility and recommendations", () => {
  it("retains valid alternatives and changes no source purposes or acceptance state", () => {
    const values = [
      image("one"),
      image("two", { sourceType: "ARTWORK" }),
      image("cover", {
        sourceType: "COVER",
        purpose: "POSTER",
        width: 1000,
        height: 1500,
      }),
    ];
    const original = structuredClone(values),
      result = rankMediaCandidates(values, gameContext, "HERO_ART");
    expect(result.recommended?.state).toBe("RECOMMENDED");
    expect(result.alternatives.map((value) => value.state)).toEqual([
      "ELIGIBLE",
    ]);
    expect(result.rejected[0]?.reasons).toContainEqual(
      expect.objectContaining({ code: "UNSUITABLE_SOURCE_TYPE" }),
    );
    expect(values).toEqual(original);
    expect(result.recommended?.candidate.purpose).toBeNull();
    expect(result.recommended?.purpose).toBe("HERO_ART");
    expect(result.recommended).not.toHaveProperty("accepted");
    expect(mediaSelectionSchema.safeParse(result).success).toBe(true);
  });
  it("maps covers to POSTER and allows legacy square game covers", () => {
    const result = rankMediaCandidates(
      [
        image("portrait", { sourceType: "COVER", width: 1000, height: 1500 }),
        image("square", { sourceType: "COVER", width: 600, height: 600 }),
      ],
      gameContext,
      "POSTER",
    );
    expect(result.recommended).toMatchObject({
      purpose: "POSTER",
      candidate: { providerAssetId: "portrait" },
    });
    expect(result.alternatives[0]?.candidate.providerAssetId).toBe("square");
  });
  it.each([
    [{ width: 640, height: 360 }, "INSUFFICIENT_RESOLUTION"],
    [{ width: 1000, height: 1500 }, "UNSUITABLE_ASPECT_RATIO"],
    [{ width: 20_000, height: 12_000 }, "EXCESSIVE_PIXEL_AREA"],
    [
      { sourceUrl: "https://images.igdb.com.attacker.test/image.jpg" },
      "UNSUPPORTED_SOURCE_URL",
    ],
  ] as const)("rejects technical failures: %j", (patch, code) => {
    const result = rankMediaCandidates(
      [image("invalid", patch)],
      gameContext,
      "HERO_ART",
    );
    expect(result.recommended).toBeNull();
    expect(result.rejected[0]?.reasons).toContainEqual(
      expect.objectContaining({ code }),
    );
  });
  it("rejects foreign owners and known unreadable images", () => {
    const broken = image("broken"),
      foreign = image("foreign", {
        owner: {
          kind: "TITLE",
          identity: { provider: "IGDB", entity: "game", id: "2" },
        },
      });
    const result = rankMediaCandidates(
      [broken, foreign],
      gameContext,
      "HERO_ART",
      { evidence: [inspection(broken, { broken: true })] },
    );
    expect(
      result.rejected.map((value) => value.reasons[0]?.code).sort(),
    ).toEqual(["BROKEN_IMAGE", "OWNER_MISMATCH"]);
  });
  it("does not call missing dimensions invalid or invent them", () => {
    const result = rankMediaCandidates(
      [image("unknown", { width: null, height: null })],
      gameContext,
      "HERO_ART",
    );
    expect(result.recommended).toBeNull();
    expect(result.alternatives[0]).toMatchObject({
      state: "ELIGIBLE",
      recommendable: false,
      candidate: { width: null, height: null },
    });
    expect(result.alternatives[0]?.reviewReasons.join(" ")).toMatch(
      /dimensions.*unknown/i,
    );
  });
  it("deduplicates provider asset references and identical URLs deterministically", () => {
    const a = image("one"),
      b = image("one", { width: null, height: null }),
      c = image("other", { sourceUrl: a.sourceUrl });
    const forward = rankMediaCandidates([a, b, c], gameContext, "HERO_ART");
    const reverse = rankMediaCandidates([c, b, a], gameContext, "HERO_ART");
    expect(forward).toEqual(reverse);
    expect(forward.duplicates).toHaveLength(2);
    expect(forward.alternatives).toHaveLength(0);
    expect(forward.recommended?.candidate.width).toBe(1920);
  });
  it("allows only confirmed Steam mappings and uses them as fallbacks", () => {
    const identity = { provider: "STEAM", entity: "app", id: "10" } as const;
    const steam = image("steam", {
      owner: { kind: "TITLE", identity },
      sourceUrl: "https://shared.steamstatic.com/steam/apps/10/ss_example.jpg",
      provenance: { ...source(), identity },
    });
    expect(
      rankMediaCandidates([steam], gameContext, "HERO_ART").rejected[0]
        ?.reasons[0]?.code,
    ).toBe("OWNER_MISMATCH");
    const context = { ...gameContext, mappings: [{ ...source(), identity }] };
    expect(
      rankMediaCandidates([steam], context, "HERO_ART").recommended?.candidate
        .provenance.identity.provider,
    ).toBe("STEAM");
    const result = rankMediaCandidates(
      [steam, image("igdb")],
      context,
      "HERO_ART",
    );
    expect(result.recommended?.candidate.provenance.identity.provider).toBe(
      "IGDB",
    );
    expect(result.alternatives[0]?.state).toBe("ELIGIBLE");
  });
});

describe("scene-first hero scoring", () => {
  it("lets a cinematic screenshot beat 4K cover-like promotional artwork", () => {
    const screenshot = image("scene"),
      artwork = image("promo", {
        sourceType: "ARTWORK",
        width: 3840,
        height: 2160,
      });
    const result = rankMediaCandidates(
      [artwork, screenshot],
      gameContext,
      "HERO_ART",
      {
        evidence: [
          inspection(screenshot),
          inspection(
            artwork,
            scene({ coverSimilarity: 0.99, textLikelihood: 0.5 }),
          ),
        ],
      },
    );
    expect(result.recommended?.candidate.providerAssetId).toBe("scene");
    expect(result.alternatives[0]?.state).toBe("ELIGIBLE");
    expect(
      result.alternatives[0]?.factors.find((value) => value.name === "text")
        ?.points,
    ).toBeLessThan(-20);
  });
  it("lets clean artwork beat HUD-heavy gameplay without rejecting the screenshot", () => {
    const shot = image("hud"),
      art = image("art", { sourceType: "ARTWORK" });
    const result = rankMediaCandidates([shot, art], gameContext, "HERO_ART", {
      evidence: [
        inspection(shot, scene({ hudLikelihood: 1, textLikelihood: 0.45 })),
        inspection(art),
      ],
    });
    expect(result.recommended?.candidate.providerAssetId).toBe("art");
    expect(result.alternatives[0]).toMatchObject({
      state: "ELIGIBLE",
      candidate: { providerAssetId: "hud" },
    });
  });
  it("keeps extreme text heuristics as editorial warnings rather than technical rejection", () => {
    const promo = image("promo", { sourceType: "ARTWORK" });
    const result = rankMediaCandidates([promo], gameContext, "HERO_ART", {
      evidence: [inspection(promo, scene({ textLikelihood: 0.95 }))],
    });
    expect(result.rejected).toHaveLength(0);
    expect(result.recommended).toBeNull();
    expect(result.alternatives[0]?.reviewReasons.join(" ")).toMatch(
      /text.*editorial/i,
    );
  });
  it("caps resolution and rewards exposure that survives a dark overlay", () => {
    const dark = image("dark"),
      night = image("night"),
      huge = image("huge", { width: 3840, height: 2160 });
    const result = rankMediaCandidates(
      [dark, night, huge],
      gameContext,
      "HERO_ART",
      {
        evidence: [
          inspection(dark, scene({ averageBrightness: 0.06 })),
          inspection(night, scene({ averageBrightness: 0.25 })),
          inspection(huge, scene({ averageBrightness: 0.25 })),
        ],
      },
    );
    expect(result.recommended?.candidate.providerAssetId).not.toBe("dark");
    const rows = [result.recommended, ...result.alternatives];
    expect(
      rows
        .filter((value) => value?.candidate.providerAssetId !== "dark")
        .map(
          (value) =>
            value?.factors.find((entry) => entry.name === "resolution")?.points,
        ),
    ).toEqual([10, 10]);
  });
  it("degrades explicitly to metadata ranking and stable ties when signals are absent", () => {
    const values = [image("z"), image("a")];
    const result = rankMediaCandidates(values, gameContext, "HERO_ART");
    expect(result).toEqual(
      rankMediaCandidates([...values].reverse(), gameContext, "HERO_ART"),
    );
    expect(result.recommended?.analysis).toBe("UNAVAILABLE");
    expect(result.recommended?.reviewReasons.join(" ")).toMatch(
      /visual signals.*unavailable/i,
    );
    expect(
      rankMediaCandidates([], gameContext, "HERO_ART").recommended,
    ).toBeNull();
  });
  it("prefers a clean screen backdrop over text-bearing promotion and keeps both", () => {
    const a = image(
        "promo",
        { providerPrimary: true, providerVoteAverage: 10, languageCode: "en" },
        movieContext,
      ),
      b = image("scene", {}, movieContext);
    const result = rankMediaCandidates([a, b], movieContext, "HERO_ART", {
      evidence: [
        inspection(a, scene({ textLikelihood: 0.4, saturation: 0.8 })),
        inspection(b),
      ],
    });
    expect(result.recommended?.candidate.providerAssetId).toBe("scene");
    expect(result.alternatives).toHaveLength(1);
  });
  it("keeps explicitly assessed promotional portraits manual-only despite high resolution", () => {
    const portrait = image(
      "studio-promo",
      {
        width: 3840,
        height: 2160,
        providerPrimary: true,
        providerVoteAverage: 10,
      },
      movieContext,
    );
    const backdrop = image("story-scene", {}, movieContext);
    const result = rankMediaCandidates(
      [portrait, backdrop],
      movieContext,
      "HERO_ART",
      {
        evidence: [
          inspection(portrait, { composition: "PROMOTIONAL_PORTRAIT" }),
          inspection(backdrop, scene({ composition: "SCENE" })),
        ],
      },
    );
    expect(result.recommended?.candidate.providerAssetId).toBe("story-scene");
    expect(result.alternatives[0]).toMatchObject({
      state: "ELIGIBLE",
      recommendable: false,
      candidate: { providerAssetId: "studio-promo" },
    });
    expect(result.alternatives[0]?.reviewReasons.join(" ")).toMatch(
      /posed promotional portrait/i,
    );
    expect(
      rankMediaCandidates([portrait], movieContext, "HERO_ART", {
        evidence: [
          inspection(portrait, { composition: "PROMOTIONAL_PORTRAIT" }),
        ],
      }).recommended,
    ).toBeNull();
  });
  it("prefers appropriately localized clean posters without removing multilingual alternatives", () => {
    const candidates = [
      image(
        "en",
        {
          sourceType: "POSTER",
          purpose: "POSTER",
          width: 1000,
          height: 1500,
          languageCode: "en",
        },
        movieContext,
      ),
      image(
        "hi",
        { sourceType: "POSTER", width: 1000, height: 1500, languageCode: "hi" },
        movieContext,
      ),
    ];
    const result = rankMediaCandidates(candidates, movieContext, "POSTER", {
      policy: { preferredLanguages: ["hi"] },
    });
    expect(result.recommended?.candidate.languageCode).toBe("hi");
    expect(result.alternatives[0]?.candidate.languageCode).toBe("en");
  });
  it.each(["PROMOTIONAL_KEY_ART", "LOGO_CARD"] as const)(
    "keeps assessed %s manual-only even when no scene alternative exists",
    (composition) => {
      const promo = image("assessed-art", {
        sourceType: "ARTWORK",
        width: 3840,
        height: 2160,
      });
      const evidence = [inspection(promo, scene({ composition }))];
      const result = rankMediaCandidates([promo], gameContext, "HERO_ART", {
        evidence,
      });
      expect(result.recommended).toBeNull();
      expect(result.rejected).toEqual([]);
      expect(result.alternatives[0]).toMatchObject({
        state: "ELIGIBLE",
        recommendable: false,
        visualSignals: { composition },
      });
      expect(result.alternatives[0]?.reviewReasons.join(" ")).toMatch(
        /prefer an in-scene backdrop/i,
      );
      const clean = image("clean-art", { sourceType: "ARTWORK" });
      expect(
        rankMediaCandidates([promo, clean], gameContext, "HERO_ART", {
          evidence: [
            ...evidence,
            inspection(clean, scene({ composition: "SCENE" })),
          ],
        }).recommended?.candidate.providerAssetId,
      ).toBe("clean-art");
    },
  );
  it("bounds optional evidence and rejects invalid signals instead of accepting NaN scores", () => {
    const candidate = image("one");
    expect(() =>
      validateSelectionEvidence({
        media: [inspection(candidate, { textLikelihood: 2 })],
      }),
    ).toThrow(/invalid/i);
    expect(() =>
      validateSelectionEvidence({
        media: Array.from({ length: 25 }, (_, index) => ({
          ...inspection(candidate),
          key: String(index),
        })),
      }),
    ).toThrow(/budget/i);
    expect(() =>
      validateSelectionEvidence({
        media: [inspection(candidate), inspection(candidate)],
      }),
    ).toThrow(/duplicate/i);
    expect(() =>
      rankMediaCandidates(
        Array.from({ length: 2001 }, () => candidate),
        gameContext,
        "HERO_ART",
      ),
    ).toThrow(/budget/i);
    expect(inspection(candidate).key).toBe(mediaCandidateKey(candidate));
  });
});
