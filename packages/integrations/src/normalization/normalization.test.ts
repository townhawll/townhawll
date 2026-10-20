import { describe, expect, it } from "vitest";

import { known, mapField, missing } from "../candidate-fields.js";
import {
  aliasCandidateSchema,
  type CandidateField,
  type Provenance,
} from "../contracts.js";
import {
  classifyAnime,
  comparisonKey,
  exactCalendarDate,
  inferGameReleaseStatus,
  mapProvidedStatus,
  normalizeAliases,
  normalizeCodes,
  normalizeCountryCode,
  normalizeLanguageCode,
  normalizeReleaseDate,
  releaseDateField,
} from "./index.js";

const source: Provenance = {
  identity: { provider: "TMDB", entity: "movie", id: "1" },
  fetchedAt: "2026-10-21T00:30:00.000Z",
  sourceUpdatedAt: null,
  sourceUrl: null,
};
function alias(
  name: string,
  languageCode: string | null = null,
  countryCode: string | null = null,
  sourceType: string | null = null,
) {
  return {
    name,
    languageCode,
    countryCode,
    sourceType,
    normalizedKey: "untrusted",
    provenance: source,
  };
}

describe("aliases", () => {
  it("normalizes Unicode, punctuation, trademarks and whitespace before deduplication", () => {
    const result = normalizeAliases(
      [
        alias("  Ｅxample™:   Adventure  "),
        alias("Example Adventure"),
        alias("King’s Quest"),
        alias("King's Quest"),
        alias("KING’S    QUEST"),
      ],
      ["Example Adventure"],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "King’s Quest",
      normalizedKey: "king s quest",
    });
    expect(result[0]?.sourceVariants?.map((value) => value.name)).toEqual([
      "King’s Quest",
      "King's Quest",
      "KING’S QUEST",
    ]);
    expect(normalizeAliases(result, ["Example Adventure"])).toEqual(result);
  });
  it("preserves multilingual alternatives and combining marks without inferring language", () => {
    const result = normalizeAliases(
      [
        alias("カウボーイビバップ", "jpn", "jp"),
        alias("Cowboy Bebop", "en", "US"),
        alias("कहानी", "hin"),
        alias("Kahaani"),
        alias("2001"),
      ],
      ["A different canonical title"],
    );
    expect(result.map((value) => value.name)).toEqual([
      "カウボーイビバップ",
      "Cowboy Bebop",
      "कहानी",
      "Kahaani",
      "2001",
    ]);
    expect(result.map((value) => value.languageCode)).toEqual([
      "ja",
      "en",
      "hi",
      null,
      null,
    ]);
    expect(comparisonKey("कहानी")).toBe("कहानी");
    expect(
      result.every((value) => aliasCandidateSchema.safeParse(value).success),
    ).toBe(true);
  });
  it("merges duplicate source variants without inventing a single language or region", () => {
    const result = normalizeAliases(
      [
        alias("Alternative", "eng", "us", "Working title"),
        alias("Alternative", "fr", "fr", "Localized title"),
      ],
      [],
    );
    expect(result[0]).toMatchObject({
      languageCode: null,
      countryCode: null,
      provenance: source,
    });
    expect(result[0]?.sourceVariants).toEqual([
      {
        name: "Alternative",
        languageCode: "en",
        countryCode: "US",
        sourceType: "Working title",
      },
      {
        name: "Alternative",
        languageCode: "fr",
        countryCode: "FR",
        sourceType: "Localized title",
      },
    ]);
  });
  it.each([
    "game.exe",
    "ｇａｍｅ．ｅｘｅ",
    "GAME.EXE - launcher",
    "launcher.bat",
    "game.app",
    "https://example.test/title",
    "C:\\game\\name",
    "N/A",
    "TBD",
    "???",
    "a".repeat(32),
  ])("removes obvious noise: %s", (name) => {
    expect(normalizeAliases([alias(name)], [])).toEqual([]);
  });
  it("removes explicitly labeled executable names but retains useful working titles", () => {
    expect(
      normalizeAliases(
        [
          alias("internal_binary", null, null, "Executable"),
          alias("Project Moon", null, null, "Working title"),
        ],
        [],
      ).map((value) => value.name),
    ).toEqual(["Project Moon"]);
  });
});

describe("dates and status provenance", () => {
  it.each([
    ["2024-02-29", { precision: "DAY", date: "2024-02-29" }],
    ["2024-02", { precision: "MONTH", year: 2024, month: 2 }],
    ["2024", { precision: "YEAR", year: 2024 }],
    ["2024-Q3", { precision: "QUARTER", year: 2024, quarter: 3 }],
  ])("preserves actual precision for %s", (input, expected) => {
    expect(normalizeReleaseDate(input)).toEqual(expected);
    expect(normalizeReleaseDate(expected)).toEqual(expected);
  });
  it.each([
    null,
    "",
    "2023-02-29",
    "2024-13",
    "2024-Q5",
    "2024-02-29T00:00:00Z",
    "circa 2024",
    "TBA",
  ])("does not invent an exact date from %s", (input) => {
    expect(normalizeReleaseDate(input)).toBeNull();
    expect(
      exactCalendarDate(typeof input === "string" ? input : null),
    ).toBeNull();
  });
  it("keeps absent and malformed date evidence distinct", () => {
    expect(releaseDateField(null, source)).toEqual(missing());
    expect(releaseDateField("2025-02-29", source)).toEqual(
      missing("UNSUPPORTED"),
    );
    expect(releaseDateField("2024", source)).toMatchObject({
      certainty: "PROVIDED",
      provenance: source,
      value: { precision: "YEAR" },
    });
  });
  const statuses = new Map<string, "RELEASED" | "CANCELLED" | "UNKNOWN">([
    ["released", "RELEASED"],
    ["cancelled", "CANCELLED"],
  ]);
  it("keeps explicit known and unrecognized statuses separate from inference", () => {
    const past = releaseDateField("2020-01-01", source);
    const future = releaseDateField("2030-01-01", source);
    const cancelled = mapProvidedStatus(
      " Cancelled ",
      statuses,
      "UNKNOWN",
      source,
    );
    const unknown = mapProvidedStatus(
      "constructor",
      statuses,
      "UNKNOWN",
      source,
    );
    expect(inferGameReleaseStatus(cancelled, past, source)).toEqual(cancelled);
    expect(inferGameReleaseStatus(unknown, future, source)).toMatchObject({
      value: "UNKNOWN",
      certainty: "PROVIDED",
    });
    expect(
      inferGameReleaseStatus(missing("UNAVAILABLE"), past, source),
    ).toEqual(missing("UNAVAILABLE"));
  });
  it("infers only from a verified day against the fixed UTC fetch date", () => {
    expect(
      inferGameReleaseStatus(
        missing(),
        releaseDateField("2026-10-21", source),
        source,
      ),
    ).toMatchObject({
      value: "RELEASED",
      certainty: "INFERRED",
      provenance: source,
      evidence: [expect.any(String)],
    });
    expect(
      inferGameReleaseStatus(
        missing(),
        releaseDateField("2026-10-22", source),
        source,
      ),
    ).toMatchObject({ value: "UPCOMING", certainty: "INFERRED" });
    expect(
      inferGameReleaseStatus(
        missing(),
        releaseDateField("2026", source),
        source,
      ),
    ).toEqual(missing());
    expect(inferGameReleaseStatus(missing(), missing(), source)).toEqual(
      missing(),
    );
  });
});

describe("anime evidence and language metadata", () => {
  const evidence = (
    genres: string[],
    keywords: CandidateField<string[]> = missing(),
    originalLanguage: CandidateField<string> = missing(),
    countries: CandidateField<string[]> = missing(),
  ) => ({
    genres: known(genres, source),
    keywords,
    originalLanguage,
    countries,
  });
  it("does not equate Animation with anime", () => {
    expect(classifyAnime(evidence(["Animation"]), source)).toEqual(missing());
    expect(
      classifyAnime(
        evidence(["Animation"], missing(), known("ja", source)),
        source,
      ),
    ).toEqual(missing());
    expect(
      classifyAnime(
        evidence(["Animation"], missing(), missing(), known(["JP"], source)),
        source,
      ),
    ).toEqual(missing());
  });
  it("requires explicit anime evidence or Japanese language plus origin", () => {
    expect(
      classifyAnime(evidence(["Animation"], known(["anime"], source)), source),
    ).toMatchObject({ value: true, certainty: "INFERRED" });
    expect(
      classifyAnime(
        evidence(
          ["Animation"],
          missing(),
          known("ja", source),
          known(["JP"], source),
        ),
        source,
      ),
    ).toMatchObject({
      value: true,
      certainty: "INFERRED",
      evidence: [expect.any(String), expect.any(String)],
    });
  });
  it("avoids Japanese live-action, Western animation and anime-inspired false positives", () => {
    expect(
      classifyAnime(
        evidence(
          ["Drama"],
          known([], source),
          known("ja", source),
          known(["JP"], source),
        ),
        source,
      ),
    ).toMatchObject({ value: false });
    expect(
      classifyAnime(
        evidence(
          ["Animation"],
          known(["anime inspired"], source),
          known("en", source),
          known(["US"], source),
        ),
        source,
      ),
    ).toMatchObject({ value: false });
    expect(
      classifyAnime(evidence(["Drama"], known(["anime"], source)), source),
    ).toEqual(missing("UNSUPPORTED"));
    expect(
      classifyAnime(
        { ...evidence([]), genres: missing("UNAVAILABLE") },
        source,
      ),
    ).toEqual(missing("UNAVAILABLE"));
  });
  it.each([
    ["ENG", "en"],
    ["jpn", "ja"],
    ["zh_hant_tw", "zh-Hant-TW"],
    ["iw", "he"],
    ["und", null],
    ["xx", null],
    ["English", null],
  ])("normalizes explicit language code %s", (raw, expected) => {
    expect(normalizeLanguageCode(raw)).toBe(expected);
  });
  it("normalizes and deduplicates explicit codes without turning country into audio evidence", () => {
    expect(
      normalizeCodes(["us", "US", "uk", "", "XX"], normalizeCountryCode),
    ).toEqual(["US", "GB"]);
    expect(
      normalizeCodes(["eng", "en", "jpn", "und"], normalizeLanguageCode),
    ).toEqual(["en", "ja"]);
    expect(normalizeLanguageCode("JP")).toBe("jp"); // A well-formed code is not evidence of Japanese audio.
  });
  it("mapping known fields preserves certainty/evidence/provenance and missing reasons", () => {
    const input = {
      ...known(["en", "fr"], source),
      certainty: "INFERRED" as const,
      evidence: ["Explicit source language list; dubbing remains unsupported."],
    };
    expect(mapField(input, (values) => values.length)).toEqual({
      ...input,
      value: 2,
    });
    expect(
      mapField(missing("UNSUPPORTED"), (values: string[]) => values.length),
    ).toEqual(missing("UNSUPPORTED"));
  });
});
