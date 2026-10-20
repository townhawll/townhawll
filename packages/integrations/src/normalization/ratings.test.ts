import type { z } from "zod";
import { describe, expect, it } from "vitest";

import { known, missing } from "../candidate-fields.js";
import {
  ageRatingSelectionSchema,
  certificationSchema,
  type Provenance,
} from "../contracts.js";
import {
  normalizeCertification,
  selectAgeRating,
  validateNormalizationPolicy,
} from "./ratings.js";

const source: Provenance = {
  identity: { provider: "TMDB", entity: "movie", id: "1" },
  fetchedAt: "2026-10-21T00:00:00.000Z",
  sourceUpdatedAt: null,
  sourceUrl: null,
};
type Certification = z.infer<typeof certificationSchema>;
function rating(
  certification: string,
  system: string | null,
  country: string | null = null,
): Certification {
  return { certification, system, country, provenance: source };
}

describe("system-aware age buckets", () => {
  it.each([
    ["MPA", "PG-13", "MOVIE", "13+"],
    ["MPAA", "G", "MOVIE", "All ages"],
    ["MPA", "R", "MOVIE", "18+"],
    ["CBFC", "U", "MOVIE", "All ages"],
    ["CBFC", "UA 7+", "MOVIE", "7+"],
    ["CBFC", "U/A 13+", "MOVIE", "13+"],
    ["CBFC", "UA16+", "MOVIE", "16+"],
    ["CBFC", "A", "MOVIE", "18+"],
    ["ESRB", "E", "GAME", "All ages"],
    ["ESRB", "E10+", "GAME", "13+"],
    ["ESRB", "Teen", "GAME", "13+"],
    ["ESRB", "Mature 17+", "GAME", "18+"],
    ["PEGI", "3", "GAME", "All ages"],
    ["PEGI", "7", "GAME", "7+"],
    ["PEGI", "12", "GAME", "13+"],
    ["PEGI", "16", "GAME", "16+"],
    ["PEGI", "18", "GAME", "18+"],
    ["CERO", "A", "GAME", "All ages"],
    ["CERO", "B", "GAME", "13+"],
    ["CERO", "C", "GAME", "16+"],
    ["CERO", "D", "GAME", "18+"],
    ["CERO", "Z", "GAME", "18+"],
    ["US_TV", "TV-Y7", "SERIES", "7+"],
    ["US_TV", "TV-14", "SERIES", "16+"],
    ["US_TV", "TV-MA", "SERIES", "18+"],
    ["BBFC", "12A", "MOVIE", "13+"],
    ["USK", "6", "GAME", "7+"],
    ["GRAC", "15", "GAME", "16+"],
    ["CLASS_IND", "L", "GAME", "All ages"],
    ["ACB", "MA15+", "GAME", "16+"],
    ["FSK", "12", "MOVIE", "13+"],
  ] as const)(
    "maps %s %s (%s) to %s without changing the source",
    (system, label, kind, expected) => {
      const original = rating(label, system);
      expect(normalizeCertification(original, kind)).toMatchObject({
        bucket: expected,
        systemInferred: false,
      });
      expect(original).toEqual(rating(label, system));
    },
  );
  it.each([
    ["MPA", "NR", "MOVIE"],
    ["MPA", "Unrated", "MOVIE"],
    ["MPA", "", "MOVIE"],
    ["CBFC", "UA", "MOVIE"],
    ["CBFC", "U/A", "MOVIE"],
    ["CBFC", "S", "MOVIE"],
    ["ESRB", "RP", "GAME"],
    ["ESRB", "12", "GAME"],
    ["PEGI", "T", "GAME"],
    ["CERO", "18", "GAME"],
    ["Unknown", "18", "MOVIE"],
    ["constructor", "T", "GAME"],
    ["ESRB", "E", "MOVIE"],
    ["MPA", "G", "GAME"],
    ["BBFC", "probably 18", "MOVIE"],
  ] as const)(
    "leaves unsupported/ambiguous %s %s (%s) unknown",
    (system, label, kind) => {
      const raw = rating(label, system);
      expect(normalizeCertification(raw, kind)).toBeNull();
      expect(selectAgeRating(known([raw], source), kind)).toEqual(
        missing("UNSUPPORTED"),
      );
    },
  );
  it("never treats identical letters/numbers as interchangeable systems", () => {
    expect(normalizeCertification(rating("A", "CBFC"), "MOVIE")?.bucket).toBe(
      "18+",
    );
    expect(normalizeCertification(rating("A", "CERO"), "GAME")?.bucket).toBe(
      "All ages",
    );
    expect(normalizeCertification(rating("12", "PEGI"), "GAME")?.bucket).toBe(
      "13+",
    );
    expect(normalizeCertification(rating("12", "ESRB"), "GAME")).toBeNull();
  });
  it("infers only supported region/domain authorities and keeps original values intact", () => {
    const raw = rating(" PG-13 ", null, "US");
    const result = selectAgeRating(known([raw], source), "MOVIE");
    expect(result).toMatchObject({
      state: "known",
      certainty: "INFERRED",
      value: {
        normalizedAgeRating: "13+",
        effectiveCertification: "PG-13",
        effectiveCertificationSystem: "MPA",
        effectiveCertificationCountry: "US",
      },
      provenance: source,
    });
    expect(raw.certification).toBe(" PG-13 ");
    expect(raw.system).toBeNull();
    expect(
      normalizeCertification(rating("TV-MA", null, "US"), "SERIES")?.system,
    ).toBe("US_TV");
    expect(
      normalizeCertification(rating("PG-13", null, "US"), "SERIES"),
    ).toBeNull();
    expect(normalizeCertification(rating("T", null, "US"), "GAME")).toBeNull();
    expect(
      normalizeCertification(rating("PG-13", "Unknown", "US"), "MOVIE"),
    ).toBeNull();
    expect(
      result.state === "known" &&
        ageRatingSelectionSchema.safeParse(result.value).success,
    ).toBe(true);
  });
});

describe("market selection and missing data", () => {
  const originals = [
    rating("A", "CBFC", "IN"),
    rating("PG-13", "MPA", "US"),
    rating("U", "BBFC", "GB"),
  ];
  it("uses a configured preferred market before conservative global fallback", () => {
    expect(
      selectAgeRating(known(originals, source), "MOVIE", {
        preferredMarket: "us",
      }),
    ).toMatchObject({
      value: {
        normalizedAgeRating: "13+",
        effectiveCertificationCountry: "US",
      },
    });
    expect(selectAgeRating(known(originals, source), "MOVIE")).toMatchObject({
      value: {
        normalizedAgeRating: "18+",
        effectiveCertificationCountry: "IN",
      },
    });
  });
  it("skips unrated markets and checks ordered fallbacks before other supported certifications", () => {
    const values = known(
      [
        rating("NR", "MPA", "US"),
        ...originals.filter((value) => value.country !== "US"),
      ],
      source,
    );
    expect(
      selectAgeRating(values, "MOVIE", {
        preferredMarket: "US",
        fallbackMarkets: ["CA", "uk", "IN"],
      }),
    ).toMatchObject({
      value: {
        normalizedAgeRating: "All ages",
        effectiveCertificationCountry: "GB",
      },
    });
    expect(
      selectAgeRating(values, "MOVIE", {
        preferredMarket: "CA",
        fallbackMarkets: ["NZ"],
      }),
    ).toMatchObject({ value: { normalizedAgeRating: "18+" } });
  });
  it("uses known game authority regions without inventing a certification country", () => {
    const values = known(
      [rating("E", "ESRB"), rating("18", "PEGI"), rating("B", "CERO")],
      source,
    );
    expect(
      selectAgeRating(values, "GAME", { preferredMarket: "US" }),
    ).toMatchObject({
      value: {
        normalizedAgeRating: "All ages",
        effectiveCertificationCountry: null,
        effectiveCertificationSystem: "ESRB",
      },
    });
    expect(
      selectAgeRating(values, "GAME", { preferredMarket: "JP" }),
    ).toMatchObject({
      value: {
        normalizedAgeRating: "13+",
        effectiveCertificationSystem: "CERO",
      },
    });
    expect(
      selectAgeRating(values, "GAME", { preferredMarket: "FR" }),
    ).toMatchObject({
      value: {
        normalizedAgeRating: "18+",
        effectiveCertificationSystem: "PEGI",
      },
    });
  });
  it("prefers an explicit region over an authority association and resolves conflicts deterministically", () => {
    const values = [
      rating("18", "PEGI"),
      rating("12", "PEGI", "DE"),
      rating("16", "USK", "DE"),
    ];
    const before = structuredClone(values);
    const result = selectAgeRating(known(values, source), "GAME", {
      preferredMarket: "DE",
    });
    expect(result).toMatchObject({
      value: {
        normalizedAgeRating: "16+",
        effectiveCertificationSystem: "USK",
      },
    });
    expect(
      selectAgeRating(known([...values].reverse(), source), "GAME", {
        preferredMarket: "DE",
      }),
    ).toEqual(result);
    expect(values).toEqual(before);
  });
  it("breaks equal bucket ties using source evidence rather than input order", () => {
    const older = {
      ...rating("R", "MPA", "US"),
      provenance: { ...source, sourceUpdatedAt: "2020-01-01T00:00:00.000Z" },
    };
    const newer = {
      ...older,
      provenance: { ...source, sourceUpdatedAt: "2021-01-01T00:00:00.000Z" },
    };
    expect(selectAgeRating(known([older, newer], source), "MOVIE")).toEqual(
      selectAgeRating(known([newer, older], source), "MOVIE"),
    );
  });
  it("does not mutate or discard raw unsupported, blank or unrated evidence", () => {
    const raw = [
      rating("", null, "US"),
      rating("UA", "CBFC", "IN"),
      rating("18", "Unknown", "CA"),
    ];
    const input = known(raw, source),
      before = structuredClone(input);
    expect(selectAgeRating(input, "MOVIE")).toEqual(missing("UNSUPPORTED"));
    expect(input).toEqual(before);
    expect(
      raw.every((value) => certificationSchema.safeParse(value).success),
    ).toBe(true);
    expect(selectAgeRating(known([], source), "MOVIE")).toEqual(missing());
    expect(selectAgeRating(missing("UNAVAILABLE"), "MOVIE")).toEqual(
      missing("UNAVAILABLE"),
    );
  });
  it("validates only the small explicit normalization policy", () => {
    expect(
      validateNormalizationPolicy({
        preferredMarket: "uk",
        fallbackMarkets: ["in"],
      }),
    ).toEqual({ preferredMarket: "GB", fallbackMarkets: ["IN"] });
    for (const input of [
      { preferredMarket: "USA" },
      { preferredMarket: "XX" },
      { fallbackMarkets: Array<string>(21).fill("US") },
      { unknown: true },
    ]) {
      expect(() => validateNormalizationPolicy(input)).toThrow(
        "Invalid catalogue normalization policy.",
      );
    }
  });
});
