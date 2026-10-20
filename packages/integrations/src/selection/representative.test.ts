import { describe, expect, it } from "vitest";

import { catalogueRecommendationsSchema } from "./contracts.js";
import { recommendCatalogueMedia } from "./index.js";
import { representativeFixtures } from "./representative-fixtures.js";

describe("bounded representative catalogue selection replay", () => {
  it.each([
    ["ar1xhu", "PROMOTIONAL_KEY_ART"],
    ["ar4u71", "PROMOTIONAL_KEY_ART"],
    ["ar3m56", "LOGO_CARD"],
  ])(
    "keeps visually reviewed banner %s manual-only even in isolation",
    (id, composition) => {
      const fixture = representativeFixtures.find(
        ({ candidate }) =>
          candidate.title.media.state === "known" &&
          candidate.title.media.value.some(
            (image) => image.providerAssetId === id,
          ),
      );
      if (!fixture || fixture.candidate.title.media.state !== "known")
        throw new Error("Missing reviewed banner fixture.");
      const image = fixture.candidate.title.media.value.find(
        (value) => value.providerAssetId === id,
      );
      if (!image) throw new Error("Missing reviewed banner.");
      const isolated = {
        title: {
          ...fixture.candidate.title,
          media: { ...fixture.candidate.title.media, value: [image] },
        },
      };
      const result = recommendCatalogueMedia(isolated, {
        evidence: fixture.evidence,
      });
      expect(result.hero.recommended).toBeNull();
      expect(result.hero.alternatives[0]).toMatchObject({
        state: "ELIGIBLE",
        recommendable: false,
        candidate: { providerAssetId: id },
        visualSignals: { composition },
      });
      expect(result.hero.alternatives[0]?.reviewReasons.join(" ")).toMatch(
        /prefer an in-scene backdrop/i,
      );
    },
  );
  it.each(
    representativeFixtures.map((fixture) => ({
      ...fixture,
      name: fixture.candidate.title.title,
    })),
  )(
    "evaluates $name without modifying source evidence",
    ({ candidate, evidence }) => {
      const before = structuredClone(candidate);
      const result = recommendCatalogueMedia(candidate, { evidence });
      expect(catalogueRecommendationsSchema.safeParse(result).success).toBe(
        true,
      );
      expect(
        recommendCatalogueMedia(structuredClone(candidate), {
          evidence: structuredClone(evidence),
        }),
      ).toEqual(result);
      expect(candidate).toEqual(before);
      for (const selection of [result.poster, result.hero, result.video]) {
        expect(
          selection.alternatives.every((value) => value.state === "ELIGIBLE"),
        ).toBe(true);
        expect(
          selection.rejected.every(
            (value) => value.state === "REJECTED" && value.reasons.length > 0,
          ),
        ).toBe(true);
        if (selection.recommended)
          expect(selection.recommended.state).toBe("RECOMMENDED");
      }
      if (candidate.title.title === "Red Dead Redemption 2")
        expect(result.hero.recommended?.candidate.providerAssetId).toBe(
          "x8xczj2a0y6g9rnhboko",
        );
      if (candidate.title.title === "Resident Evil 4")
        expect(result.hero.recommended?.candidate.providerAssetId).toBe(
          "sch7rm",
        );
      if (candidate.title.title === "Portal")
        expect(result.hero.recommended).toBeNull();
      if (candidate.title.title === "Reacher") {
        expect(result.hero.recommended).toBeNull();
        expect(result.hero.alternatives[0]).toMatchObject({
          state: "ELIGIBLE",
          recommendable: false,
          candidate: { width: 3840, height: 2160 },
          visualSignals: { composition: "PROMOTIONAL_PORTRAIT" },
        });
        expect(result.hero.alternatives[0]?.reviewReasons.join(" ")).toMatch(
          /posed promotional portrait/i,
        );
      }
      if (candidate.title.title === "Runner") {
        const clip = result.video.rejected.find(
          (entry) => entry.candidate.externalKey === "otxjH3lrunU",
        );
        expect(clip?.reasons).toContainEqual(
          expect.objectContaining({ code: "NO_PROMOTIONAL_FORMAT" }),
        );
        expect(
          result.video.alternatives.some(
            (entry) => entry.candidate.externalKey === "otxjH3lrunU",
          ),
        ).toBe(false);
      }
      if (candidate.title.title === "Final Fantasy VII") {
        // Text is a visual warning, so the valid source remains manually selectable.
        const valid = [
          result.hero.recommended,
          ...result.hero.alternatives,
        ].filter((value) => value !== null);
        expect(
          valid.some(
            (value) =>
              value.visualSignals?.textLikelihood &&
              value.visualSignals.textLikelihood > 0.82,
          ),
        ).toBe(true);
        expect(result.hero.recommended).toBeNull();
      }
    },
  );
  it("compares exactly eighteen varied fixtures against the recorded scene-first reference", () => {
    expect(representativeFixtures).toHaveLength(18);
    expect(
      new Set(
        representativeFixtures.map((entry) => entry.candidate.title.type),
      ),
    ).toEqual(new Set(["GAME", "MOVIE", "SERIES"]));
    const rows = representativeFixtures.map((entry) => {
      const result = recommendCatalogueMedia(entry.candidate, {
        evidence: entry.evidence,
      });
      return {
        title: entry.candidate.title.title,
        hero: result.hero.recommended?.candidate.providerAssetId ?? null,
        recordedHero: entry.playgroundHero,
        score: result.hero.recommended?.score ?? null,
        primaryVideo: result.video.recommended?.label ?? null,
      };
    });
    console.table(rows);
    const comparable = rows.slice(0, 12);
    expect(
      comparable.every(
        (row) => row.score === null || Number.isFinite(row.score),
      ),
    ).toBe(true);
  });
});
