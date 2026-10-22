import { describe, expect, it } from "vitest";
import {
  possibleDuplicateMatches,
  type DuplicateTitleRow,
} from "./duplicates.ts";
import { validFixture } from "./fixtures.ts";

const row: DuplicateTitleRow = {
  id: "title-fixture",
  title: "Ingestion Fixture",
  type: "MOVIE",
  originalTitle: null,
  primaryReleaseDate: null,
  deletedAt: null,
  aliases: [],
};
describe("possible duplicate evidence", () => {
  it("normalizes punctuation, Unicode spacing and casing without fuzzy matching", () => {
    expect(
      possibleDuplicateMatches(validFixture(), [
        { ...row, title: "ＩNGESTION—Fixture™" },
      ])[0]?.evidence,
    ).toContainEqual({ kind: "TITLE_NAME", value: "ingestion fixture" });
    expect(
      possibleDuplicateMatches(validFixture(), [
        { ...row, title: "Ingestion Fixture II" },
      ]),
    ).toEqual([]);
    expect(
      possibleDuplicateMatches(validFixture(), [{ ...row, type: "SERIES" }]),
    ).toEqual([]);
  });
  it("finds exact normalized aliases and retains evidence of deleted matches", () => {
    const result = possibleDuplicateMatches(validFixture(), [
      {
        ...row,
        title: "Different title",
        deletedAt: new Date(),
        aliases: [
          { name: "Ingestion Fixture", normalizedKey: "ingestion fixture" },
        ],
      },
    ]);
    expect(result[0]).toMatchObject({
      deleted: true,
      evidence: [{ kind: "ALIAS", value: "ingestion fixture" }],
    });
  });
  it("excludes name collisions with known different years but preserves unknown dates", () => {
    const input = validFixture();
    input.candidate.title.primaryReleaseDate = {
      state: "known",
      value: { precision: "DAY", date: "2005-12-12" },
      certainty: "PROVIDED",
      evidence: [],
      provenance: input.candidate.title.mappings[0]!,
    };
    expect(
      possibleDuplicateMatches(input, [
        { ...row, primaryReleaseDate: new Date("1933-03-02") },
      ]),
    ).toEqual([]);
    expect(possibleDuplicateMatches(input, [row])).toHaveLength(1);
    expect(
      possibleDuplicateMatches(input, [
        { ...row, primaryReleaseDate: new Date("2005-12-12") },
      ])[0]?.evidence,
    ).toEqual([
      { kind: "TITLE_NAME", value: "ingestion fixture" },
      { kind: "RELEASE_YEAR", value: "2005" },
      { kind: "RELEASE_DAY", value: "2005-12-12" },
    ]);
  });
});
