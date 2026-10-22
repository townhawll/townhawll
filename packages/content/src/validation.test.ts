import { describe, expect, it } from "vitest";
import { mediaCandidateKey } from "@townhawll/integrations/selection";
import { providerMappingKey } from "@townhawll/integrations/identity";
import { validateImportSubmission, importRequestHash } from "./validation.ts";
import { submissionFixture, validFixture } from "./fixtures.ts";
import { importIdentitySchema } from "./contracts.ts";

describe("catalogue import validation", () => {
  it("rejects numeric metadata that cannot fit PostgreSQL Int fields", () => {
    const input = submissionFixture();
    if (input.candidate.title.type !== "MOVIE")
      throw new Error("Expected movie fixture.");
    input.candidate.title.metadata.runtimeMinutes = {
      state: "known",
      value: 2_147_483_648,
      certainty: "PROVIDED",
      evidence: [],
      provenance: input.candidate.title.mappings[0]!,
    };
    expect(validateImportSubmission(input).errors).toContainEqual({
      code: "INTEGER_OUT_OF_RANGE",
      path: "candidate.title.metadata.runtimeMinutes",
    });
  });
  it("accepts only confirmed supplementary game identities without changing canonical metadata", () => {
    const input = submissionFixture("123", "GAME"),
      before = structuredClone(input.candidate.title.metadata);
    const source = {
      ...input.candidate.title.mappings[0]!,
      identity: {
        provider: "STEAM" as const,
        entity: "app" as const,
        id: "620",
      },
    };
    const gameSupplement = {
      identity: source.identity,
      name: { state: "missing", reason: "NOT_PROVIDED" },
      appType: "GAME",
      sourceAppType: "game",
      requestedCountryCode: "US",
      requestedLanguageCode: "en",
      platformSupport: ["WINDOWS", "MACOS", "LINUX"].map((platform) => ({
        platform,
        supported: { state: "missing", reason: "NOT_PROVIDED" },
      })),
      systemRequirements: { state: "missing", reason: "NOT_PROVIDED" },
      provenance: source,
      issues: [],
    };
    expect(
      validateImportSubmission({ ...input, gameSupplement }).errors,
    ).toContainEqual({
      code: "UNCONFIRMED_GAME_SUPPLEMENT",
      path: "gameSupplement",
    });
    input.candidate.title.mappings.push(source);
    expect(validateImportSubmission({ ...input, gameSupplement }).valid).toBe(
      true,
    );
    expect(input.candidate.title.metadata).toEqual(before);
    expect(
      validateImportSubmission({ ...submissionFixture(), gameSupplement })
        .valid,
    ).toBe(false);
  });
  it("blocks provider-labelled non-promotional videos rather than accepting arbitrary valid URLs", () => {
    const input = submissionFixture(),
      source = input.candidate.title.mappings[0]!;
    input.candidate.title.videos = {
      state: "known",
      certainty: "PROVIDED",
      evidence: [],
      provenance: source,
      value: [
        {
          platform: "YouTube",
          externalKey: "abcdefghijk",
          providerVideoId: "video-id",
          type: {
            state: "known",
            value: "OTHER",
            certainty: "PROVIDED",
            evidence: [],
            provenance: source,
          },
          sourceType: "Behind the Scenes",
          name: "Behind the Scenes",
          official: { state: "missing", reason: "UNSUPPORTED" },
          languageCode: { state: "missing", reason: "UNSUPPORTED" },
          provenance: source,
        },
      ],
    };
    expect(
      validateImportSubmission({
        ...input,
        selectedVideos: ["YouTube:abcdefghijk"],
      }).errors,
    ).toContainEqual({
      code: "INVALID_VIDEO_REFERENCE",
      path: "selectedVideos",
    });
  });
  it.each(["MOVIE", "SERIES", "GAME"] as const)(
    "validates %s without inventing optional data or approving media",
    (type) => {
      const input = submissionFixture("123", type);
      const result = validateImportSubmission(input);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toContainEqual({
        code: "MISSING_POSTER",
        path: "selectedMedia",
      });
      expect(result.missing).toContain("candidate.title.primaryReleaseDate");
      expect(input.candidate.title.primaryReleaseDate.state).toBe("missing");
      expect(input).not.toHaveProperty("publicationStatus");
    },
  );
  it.each([
    null,
    {},
    { provider: "TMDB", entity: "movie", id: "0" },
    { provider: "TMDB", entity: "movie", id: "01" },
    { provider: "TMDB", entity: "series", id: "../1" },
    { provider: "IGDB", entity: "movie", id: "1" },
    { provider: "STEAM", entity: "app", id: "1" },
  ])("rejects invalid/unsupported primary identity %j", (value) => {
    expect(importIdentitySchema.safeParse(value).success).toBe(false);
  });
  it("keeps equal TMDB movie and series IDs in separate namespaces", () => {
    const movie = validFixture("42"),
      series = validFixture("42", "SERIES");
    expect(providerMappingKey(movie.candidate.title.identity).providerId).toBe(
      "movie:42",
    );
    expect(providerMappingKey(series.candidate.title.identity).providerId).toBe(
      "series:42",
    );
    expect(importRequestHash(movie)).not.toBe(importRequestHash(series));
  });
  it("blocks invalid canonical fields and cross-type metadata", () => {
    const input = submissionFixture();
    expect(
      validateImportSubmission({
        ...input,
        canonical: { ...input.canonical, title: " " },
      }).valid,
    ).toBe(false);
    expect(
      validateImportSubmission({
        ...input,
        canonical: { ...input.canonical, slug: "../admin" },
      }).valid,
    ).toBe(false);
    expect(
      validateImportSubmission({
        ...input,
        canonical: { ...input.canonical, type: "SERIES" },
      }).errors,
    ).toContainEqual({ code: "TITLE_TYPE_MISMATCH", path: "canonical.type" });
    expect(validateImportSubmission(input.candidate).valid).toBe(false);
  });
  it("warns for partial dates and preserves their actual precision", () => {
    const input = submissionFixture();
    input.candidate.title.primaryReleaseDate = {
      state: "known",
      value: { precision: "YEAR", year: 2027 },
      certainty: "PROVIDED",
      evidence: [],
      provenance: input.candidate.title.mappings[0]!,
    };
    expect(validateImportSubmission(input).warnings).toContainEqual({
      code: "PARTIAL_RELEASE_DATE",
      path: "candidate.title.primaryReleaseDate",
    });
    expect(input.candidate.title.primaryReleaseDate.value).toEqual({
      precision: "YEAR",
      year: 2027,
    });
  });
  it("blocks nonexistent/foreign and duplicate media references", () => {
    const input = submissionFixture(),
      source = input.candidate.title.mappings[0]!;
    const image = {
      owner: { kind: "TITLE" as const, identity: source.identity },
      purpose: "POSTER" as const,
      sourceType: "POSTER" as const,
      providerAssetId: "/poster.jpg",
      sourceUrl: "https://image.tmdb.org/t/p/original/poster.jpg",
      width: 1000,
      height: 1500,
      languageCode: null,
      provenance: source,
    };
    input.candidate.title.media = {
      state: "known",
      value: [image],
      certainty: "PROVIDED",
      evidence: [],
      provenance: source,
    };
    const selection = { key: mediaCandidateKey(image), purpose: "POSTER" };
    expect(
      validateImportSubmission({ ...input, selectedMedia: [selection] }).valid,
    ).toBe(true);
    expect(
      validateImportSubmission({
        ...input,
        selectedMedia: [selection, selection],
      }).valid,
    ).toBe(false);
    expect(
      validateImportSubmission({
        ...input,
        selectedMedia: [{ ...selection, key: "nonexistent" }],
      }).valid,
    ).toBe(false);
    image.owner.identity = { provider: "TMDB", entity: "movie", id: "999" };
    expect(
      validateImportSubmission({
        ...input,
        selectedMedia: [{ ...selection, key: mediaCandidateKey(image) }],
      }).errors,
    ).toContainEqual({
      code: "INVALID_MEDIA_REFERENCE",
      path: "selectedMedia",
    });
  });
  it("does not leak invalid raw input or accept credentials inside submissions", () => {
    const result = validateImportSubmission({
      ...submissionFixture(),
      password: "super-private-secret",
    });
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result)).not.toContain("super-private-secret");
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(validateImportSubmission(circular).valid).toBe(false);
  });
  it("hashes normalized requests stably and detects material changes", () => {
    const input = validFixture();
    expect(importRequestHash(input)).toBe(
      importRequestHash(structuredClone(input)),
    );
    expect(
      importRequestHash({
        ...input,
        canonical: { ...input.canonical, title: "Changed" },
      }),
    ).not.toBe(importRequestHash(input));
  });
});
