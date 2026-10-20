import { describe, expect, it } from "vitest";

import { known } from "../candidate-fields.js";
import { videoSelectionSchema } from "./contracts.js";
import { rankVideoCandidates, classifyVideoLabel } from "./videos.js";
import {
  channelId,
  gameContext,
  movieContext,
  providedTrailer,
  source,
  verification,
  video,
} from "./fixtures.js";
import {
  validateSelectionEvidence,
  validateSelectionPolicy,
} from "./evidence.js";

const policy = { trustedYoutubeChannelIds: [channelId] };
describe("video classification and identity", () => {
  it.each([
    ["Official Gameplay Trailer", "TRAILER", "Gameplay Trailer"],
    ["Gameplay Reveal", "GAMEPLAY", "Gameplay Reveal"],
    ["Official Main Trailer", "TRAILER", "Main Trailer"],
    ["Final Trailer", "TRAILER", "Final Trailer"],
    ["Announcement Teaser Trailer", "TEASER", "Announcement Teaser"],
    ["Official Gameplay & Release Date Trailer", "TRAILER", "Gameplay Trailer"],
    ["Example Adventure Official Gameplay Video", "GAMEPLAY", "Gameplay"],
    ["First Look", "OTHER", "First Look"],
    ["予告編", "TRAILER", "Trailer"],
  ])("classifies the specific format in %s", (title, category, label) =>
    expect(classifyVideoLabel(title)).toEqual({ category, label }),
  );
  it("never treats generic IGDB labels as verified YouTube metadata", () => {
    const result = rankVideoCandidates([video()], gameContext);
    expect(result.recommended).toBeNull();
    expect(result.alternatives[0]).toMatchObject({
      metadataVerified: false,
      uploaderVerified: false,
      association: "UNKNOWN",
      associationEvidence: "PROVIDER_SCOPE",
      classificationEvidence: "INFERRED_LABEL",
      category: "TRAILER",
      state: "ELIGIBLE",
    });
  });
  it("rejects unrelated canonical titles even if the provider calls them official trailers", () => {
    const candidate = video(
      "video000001",
      providedTrailer(movieContext),
      movieContext,
    );
    const result = rankVideoCandidates([candidate], movieContext, {
      policy,
      evidence: [verification(candidate, "Unrelated Film Official Trailer")],
    });
    expect(result.rejected[0]).toMatchObject({
      association: "MISMATCH",
      reasons: [
        expect.objectContaining({ code: "TITLE_ASSOCIATION_MISMATCH" }),
      ],
    });
  });
  it("does not let a generic provider type override independently inspected non-promo titles", () => {
    const candidate = video(
      "video000001",
      providedTrailer(movieContext),
      movieContext,
    );
    const result = rankVideoCandidates([candidate], movieContext, {
      policy,
      evidence: [verification(candidate, "Who’s who in Example Film?")],
    });
    expect(result.recommended).toBeNull();
    expect(result.rejected[0]).toMatchObject({
      metadataVerified: true,
      category: null,
      classificationEvidence: "UNKNOWN",
      reasons: [expect.objectContaining({ code: "NO_PROMOTIONAL_FORMAT" })],
    });
  });
  it.each(["YOUTUBE_DATA_API", "OEMBED"] as const)(
    "excludes the Runner social clip with %s evidence even when its uploader is trusted",
    (evidenceSource) => {
      const context = { ...movieContext, names: ["Runner"] };
      const candidate = video(
        "otxjH3lrunU",
        {
          ...providedTrailer(context),
          type: known("TEASER", source(context)),
          name: "What if RUNNER was a K-drama?",
        },
        context,
      );
      const result = rankVideoCandidates([candidate], context, {
        policy,
        evidence: [
          verification(candidate, "What if RUNNER was a K-drama? 👀 🫰", {
            source: evidenceSource,
          }),
        ],
      });
      expect(result.recommended).toBeNull();
      expect(result.alternatives).toHaveLength(0);
      expect(result.rejected[0]?.reasons).toContainEqual(
        expect.objectContaining({ code: "NO_PROMOTIONAL_FORMAT" }),
      );
      expect(result.rejected[0]?.candidate.official).toMatchObject({
        value: true,
      });
    },
  );
  it("does not trust the word official or a display name without a stable channel ID", () => {
    const candidate = video(),
      inspected = verification(candidate);
    const result = rankVideoCandidates([candidate], gameContext, {
      evidence: [inspected],
    });
    expect(result.recommended).toBeNull();
    expect(result.alternatives[0]?.uploaderVerified).toBe(false);
  });
  it("allows a specifically named official TMDB promo as an explicitly unverified suggestion", () => {
    const candidate = video(
      "video000001",
      { ...providedTrailer(), name: "Example Film Official Trailer" },
      movieContext,
    );
    const result = rankVideoCandidates([candidate], movieContext);
    expect(result.recommended).toMatchObject({
      metadataVerified: false,
      uploaderVerified: false,
      association: "MATCH",
      associationEvidence: "PROVIDER_LABEL",
      state: "RECOMMENDED",
    });
    expect(result.recommended?.reviewReasons.join(" ")).toMatch(
      /provider claim/,
    );
    expect(
      rankVideoCandidates(
        [{ ...candidate, name: "Official Trailer" }],
        movieContext,
      ).recommended,
    ).toBeNull();
  });
  it("does not attach numbered sequels to the base title", () => {
    const candidate = video();
    const result = rankVideoCandidates(
      [candidate],
      { ...gameContext, names: ["Portal"] },
      {
        policy,
        evidence: [verification(candidate, "Portal 2 Official Trailer")],
      },
    );
    expect(result.rejected[0]?.association).toBe("MISMATCH");
  });
});

describe("video exclusions and reviewable fallbacks", () => {
  it.each([
    "Full Game Longplay No Commentary",
    "Developer Diary",
    "Soundtrack",
    "Full Playthrough",
    "Boss Fight Gameplay",
    "Trailer Fan Edit",
    "AI Generated Trailer",
    "Concept Trailer",
    "Official Trailer Fan-Made",
    "Teaser #shorts",
  ])("excludes %s", (format) => {
    const candidate = video();
    const result = rankVideoCandidates([candidate], gameContext, {
      policy,
      evidence: [verification(candidate, `Example Adventure ${format}`)],
    });
    expect(result.rejected[0]?.reasons).toContainEqual(
      expect.objectContaining({ code: "NON_PROMOTIONAL_OR_FAN_CONTENT" }),
    );
  });
  it("excludes DLC-only promos for base games, while allowing the DLC's own trailer", () => {
    const candidate = video(),
      title = "Example Adventure: More DLC Trailer";
    expect(
      rankVideoCandidates([candidate], gameContext, {
        policy,
        evidence: [verification(candidate, title)],
      }).rejected[0]?.reasons,
    ).toContainEqual(
      expect.objectContaining({ code: "RELATED_CONTENT_PROMO" }),
    );
    const dlc = {
      ...gameContext,
      names: ["Example Adventure: More"],
      gameType: "DLC" as const,
    };
    expect(
      rankVideoCandidates([candidate], dlc, {
        policy,
        evidence: [verification(candidate, title)],
      }).recommended,
    ).not.toBeNull();
  });
  it.each([
    [{ availability: "UNAVAILABLE" }, "VIDEO_UNAVAILABLE"],
    [{ embeddable: false }, "NOT_EMBEDDABLE"],
    [{ isShort: true }, "SHORT_FORM_VIDEO"],
    [{ durationSeconds: 20 }, "SHORT_PROMO_CUTDOWN"],
    [{ nativeWidth: 1080, nativeHeight: 1920 }, "VERTICAL_OR_SQUARE_VIDEO"],
  ] as const)("applies independent technical evidence: %j", (patch, code) => {
    const candidate = video(),
      result = rankVideoCandidates([candidate], gameContext, {
        policy,
        evidence: [verification(candidate, undefined, patch)],
      });
    expect(result.rejected[0]?.reasons).toContainEqual(
      expect.objectContaining({ code }),
    );
  });
  it("never treats oEmbed iframe dimensions/duration as native video measurements", () => {
    const candidate = video(),
      result = rankVideoCandidates([candidate], gameContext, {
        policy,
        evidence: [
          verification(candidate, undefined, {
            source: "OEMBED",
            nativeWidth: 200,
            nativeHeight: 113,
            durationSeconds: 10,
          }),
        ],
      });
    expect(result.rejected).toHaveLength(0);
    expect(result.recommended?.reviewReasons.join(" ")).toMatch(/iframe/);
  });
  it("rejects invalid keys, mismatched evidence and foreign title provenance", () => {
    expect(
      rankVideoCandidates([video("invalid")], gameContext).rejected[0]
        ?.reasons[0]?.code,
    ).toBe("INVALID_VIDEO_REFERENCE");
    const candidate = video();
    expect(() =>
      rankVideoCandidates([candidate], gameContext, {
        evidence: [
          verification(candidate, undefined, {
            referenceUrl: "https://www.youtube.com/watch?v=video000002",
          }),
        ],
      }),
    ).toThrow(/does not match/);
    expect(
      rankVideoCandidates(
        [
          {
            ...candidate,
            provenance: {
              ...source(),
              identity: { provider: "IGDB", entity: "game", id: "2" },
            },
          },
        ],
        gameContext,
      ).rejected[0]?.reasons[0]?.code,
    ).toBe("TITLE_OWNER_MISMATCH");
  });
  it("keeps short-named legitimate titles and words like preview out of substring traps", () => {
    const candidate = video();
    expect(
      rankVideoCandidates(
        [candidate],
        { ...gameContext, names: ["Up"] },
        { policy, evidence: [verification(candidate, "Up Official Trailer")] },
      ).recommended,
    ).not.toBeNull();
    expect(
      classifyVideoLabel("Example Adventure Official Preview")?.label,
    ).toBe("Preview");
    expect(classifyVideoLabel("A Trailerful of Scenes")).toBeNull();
  });
  it("rejects gameplay trailers attached to screen titles", () => {
    const candidate = video("video000001", {}, movieContext);
    expect(
      rankVideoCandidates([candidate], movieContext, {
        policy,
        evidence: [verification(candidate, "Example Film Gameplay Trailer")],
      }).rejected[0]?.reasons[0]?.code,
    ).toBe("WRONG_CONTENT_FORMAT");
  });
  it("does not apply YouTube verification evidence to a different platform", () => {
    const candidate = video("12345", { platform: "Vimeo" });
    expect(() =>
      rankVideoCandidates([candidate], gameContext, {
        policy,
        evidence: [verification(candidate, undefined, { source: "OEMBED" })],
      }),
    ).toThrow(/does not match/);
    const result = rankVideoCandidates([candidate], gameContext, {
      policy,
      evidence: [
        verification(candidate, undefined, {
          source: "OEMBED",
          referenceUrl: "https://vimeo.com/12345",
        }),
      ],
    });
    expect(result.recommended).toBeNull();
    expect(result.alternatives[0]?.uploaderVerified).toBe(false);
  });
  it("supports localized trailer labels and complete CJK title association", () => {
    const candidate = video();
    expect(classifyVideoLabel("Bande-annonce")?.category).toBe("TRAILER");
    const generic = rankVideoCandidates([candidate], gameContext, {
      policy,
      evidence: [verification(candidate, "Bande-annonce")],
    });
    expect(generic.alternatives[0]?.association).toBe("UNKNOWN");
    const localized = rankVideoCandidates(
      [candidate],
      { ...gameContext, names: ["カウボーイビバップ"] },
      {
        policy,
        evidence: [verification(candidate, "カウボーイビバップ予告編")],
      },
    );
    expect(localized.recommended).toMatchObject({
      category: "TRAILER",
      association: "MATCH",
    });
  });
});

describe("primary recommendation, alternatives and language evidence", () => {
  it("prefers trailers and falls back to a valid teaser, gameplay or other promo", () => {
    const a = video(),
      b = video("video000002"),
      c = video("video000003");
    const evidence = [
      verification(a),
      verification(b, "Example Adventure Official Teaser"),
      verification(c, "Example Adventure Gameplay Reveal"),
    ];
    expect(
      rankVideoCandidates([a, b, c], gameContext, { policy, evidence })
        .recommended?.candidate.externalKey,
    ).toBe(a.externalKey);
    const fallback = rankVideoCandidates([b, c], gameContext, {
      policy,
      evidence: evidence.slice(1),
    });
    expect(fallback.recommended?.category).toBe("TEASER");
    expect(fallback.alternatives[0]?.category).toBe("GAMEPLAY");
    expect(
      rankVideoCandidates([c], gameContext, {
        policy,
        evidence: evidence.slice(2),
      }).recommended?.category,
    ).toBe("GAMEPLAY");
    expect(rankVideoCandidates([], gameContext).recommended).toBeNull();
  });
  it("prefers explicit per-video audio but keeps metadata language separate from proof of dubbing", () => {
    const a = video(),
      b = video("video000002");
    const result = rankVideoCandidates([a, b], gameContext, {
      policy: { ...policy, preferredLanguages: ["hi"] },
      evidence: [
        verification(a, undefined, { audioLanguageCode: "en" }),
        verification(b, undefined, { audioLanguageCode: "hi" }),
      ],
    });
    expect(result.recommended).toMatchObject({
      candidate: { externalKey: b.externalKey },
      audioLanguageCode: "hi",
      languageEvidence: "EXPLICIT_AUDIO",
    });
    const hints = rankVideoCandidates(
      [{ ...a, providerLanguageCode: "en" }],
      gameContext,
    );
    expect(hints.alternatives[0]).toMatchObject({
      audioLanguageCode: null,
      languageEvidence: "PROVIDER_HINT",
      languageHint: "en",
    });
    const explicit = rankVideoCandidates(
      [{ ...a, languageCode: known("hi", source()) }],
      gameContext,
    );
    expect(explicit.alternatives[0]).toMatchObject({
      audioLanguageCode: "hi",
      languageEvidence: "EXPLICIT_AUDIO",
    });
  });
  it("does not infer audio from subtitles or language words inside actual title names", () => {
    const candidate = video();
    for (const title of [
      "Example Adventure Official Trailer English Subtitles",
      "Johnny English Official Trailer",
    ]) {
      const context = {
        ...gameContext,
        names: ["Example Adventure", "Johnny English"],
      };
      const result = rankVideoCandidates([candidate], context, {
        policy,
        evidence: [verification(candidate, title)],
      });
      expect(result.recommended).toMatchObject({
        audioLanguageCode: null,
        languageHint: null,
        languageEvidence: "UNKNOWN",
      });
    }
    const claim = rankVideoCandidates([candidate], gameContext, {
      policy,
      evidence: [
        verification(candidate, "Example Adventure Official Trailer English"),
      ],
    });
    expect(claim.recommended).toMatchObject({
      audioLanguageCode: null,
      languageHint: "en",
      languageEvidence: "TITLE_CLAIM",
    });
  });
  it("deduplicates external video identities and keeps deterministic explanations", () => {
    const a = video(),
      b = video("video000002");
    const options = { policy, evidence: [verification(a), verification(b)] };
    const result = rankVideoCandidates(
      [b, a, { ...a, name: "Different provider label" }],
      gameContext,
      options,
    );
    expect(result).toEqual(
      rankVideoCandidates(
        [{ ...a, name: "Different provider label" }, a, b],
        gameContext,
        options,
      ),
    );
    expect(result.duplicates).toHaveLength(1);
    expect(result.alternatives).toHaveLength(1);
    expect(videoSelectionSchema.safeParse(result).success).toBe(true);
    expect(result.recommended).not.toHaveProperty("selected");
    expect(result.recommended?.candidate.name).not.toBe(
      result.recommended?.externalEvidence?.title,
    );
  });
  it("validates policy and bounds supplied evidence without calling a verification service", () => {
    expect(() =>
      validateSelectionPolicy({
        trustedYoutubeChannelIds: ["Copied Display Name"],
      }),
    ).toThrow(/invalid/i);
    const candidate = video();
    expect(() =>
      validateSelectionEvidence({
        videos: Array.from({ length: 101 }, (_, index) => ({
          ...verification(candidate),
          key: String(index),
        })),
      }),
    ).toThrow(/budget/i);
    expect(() =>
      rankVideoCandidates(
        Array.from({ length: 501 }, () => candidate),
        gameContext,
      ),
    ).toThrow(/budget/i);
  });
});
