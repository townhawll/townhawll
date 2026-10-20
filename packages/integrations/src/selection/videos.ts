import type { VideoCandidate } from "../contracts.js";
import { comparisonKey, normalizeLanguageCode } from "../normalization/text.js";
import {
  belongsToTitle,
  compareText,
  factor,
  finishSelection,
  languagePreference,
  round,
  type SelectionContext,
} from "./common.js";
import type {
  VideoEvaluation,
  VideoSelection,
  SelectionReason,
} from "./contracts.js";
import {
  validateSelectionEvidence,
  validateSelectionPolicy,
  videoCandidateKey,
  type SelectionPolicy,
  type VideoEvidence,
} from "./evidence.js";

const blocked = [
  "album",
  "soundtrack",
  "original score",
  "music video",
  "theme song",
  "unboxing",
  "behind the scenes",
  "making of",
  "developer diary",
  "dev diary",
  "interview",
  "podcast",
  "livestream",
  "live stream",
  "reaction",
  "review",
  "deleted scene",
  "official clip",
  "movie clip",
  "tv spot",
  "commercial",
  "bloopers",
  "gag reel",
  "longplay",
  "full playthrough",
  "full game",
  "walkthrough",
  "no commentary",
  "boss fight",
  "developer commentary",
  "opening cinematic",
  "shorts",
  "reels",
  "fan made",
  "fanmade",
  "fan trailer",
  "fan edit",
  "concept trailer",
  "concept",
  "concept teaser",
  "trailer concept",
  "teaser concept",
  "unofficial",
  "fake trailer",
  "ai generated",
  "ai trailer",
  "parody",
  "mashup",
  "montage",
];
const unrelatedGamePromo = [
  "dlc",
  "downloadable content",
  "expansion pack",
  "expansion trailer",
  "season pass",
  "battle pass",
  "character trailer",
  "update trailer",
  "season trailer",
  "map reveal",
  "weapon reveal",
  "patch notes",
  "collector edition",
  "collectors edition",
  "deluxe edition",
];
const phrase = (text: string, value: string) =>
  ` ${text} `.includes(` ${comparisonKey(value)} `);
function removeNames(text: string, names: string[]) {
  let result = ` ${comparisonKey(text)} `;
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const normalized = comparisonKey(name);
    if (normalized) result = result.split(` ${normalized} `).join(" ");
  }
  return result.trim();
}
export function classifyVideoLabel(title: string): {
  category: NonNullable<VideoEvaluation["category"]>;
  label: string;
} | null {
  const value = comparisonKey(title);
  if (phrase(value, "gameplay") && phrase(value, "trailer"))
    return { category: "TRAILER", label: "Gameplay Trailer" };
  for (const [term, label] of [
    ["gameplay overview", "Gameplay Overview"],
    ["gameplay reveal", "Gameplay Reveal"],
    ["gameplay demo", "Gameplay Demo"],
    ["showcase demo", "Gameplay Demo"],
  ]) {
    if (term && phrase(value, term))
      return { category: "GAMEPLAY", label: label ?? "Gameplay" };
  }
  if (phrase(value, "gameplay"))
    return { category: "GAMEPLAY", label: "Gameplay" };
  if (phrase(value, "teaser"))
    return {
      category: "TEASER",
      label: phrase(value, "announcement") ? "Announcement Teaser" : "Teaser",
    };
  for (const [term, label] of [
    ["story trailer", "Story Trailer"],
    ["launch trailer", "Launch Trailer"],
    ["final trailer", "Final Trailer"],
    ["main trailer", "Main Trailer"],
    ["announcement trailer", "Announcement Trailer"],
    ["cinematic trailer", "Cinematic Trailer"],
  ]) {
    if (term && phrase(value, term))
      return { category: "TRAILER", label: label ?? "Trailer" };
  }
  if (
    phrase(value, "trailer") ||
    /bande annonce|tráiler|трейлер|予告|예고편|预告|預告/u.test(value)
  )
    return { category: "TRAILER", label: "Trailer" };
  for (const [term, label] of [
    ["extended look", "Extended Look"],
    ["first look", "First Look"],
    ["official look", "First Look"],
    ["preview", "Preview"],
    ["glimpse", "Glimpse"],
    ["introduction", "Introduction"],
    ["deep dive", "Deep Dive"],
    ["featurette", "Featurette"],
    ["developer presentation", "Developer Presentation"],
    ["reveal", "Reveal"],
    ["announcement", "Announcement"],
  ]) {
    if (term && phrase(value, term))
      return { category: "OTHER", label: label ?? "Preview" };
  }
  return null;
}
function association(
  title: string,
  names: string[],
  verified: boolean,
): VideoEvaluation["association"] {
  const actual = ` ${comparisonKey(title)} `;
  for (const name of names) {
    const expected = comparisonKey(name.replace(/\s*\(\d{4}\)\s*$/, ""));
    let start = actual.indexOf(` ${expected} `);
    let suffix =
      start >= 0 ? actual.slice(start + expected.length + 2).trim() : "";
    // CJK trailer suffixes commonly have no spaces; compare the complete supplied title.
    if (
      start < 0 &&
      expected.length >= 3 &&
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
        expected,
      )
    ) {
      start = actual.indexOf(expected);
      suffix = start >= 0 ? actual.slice(start + expected.length).trim() : "";
    }
    if (!expected || start < 0) continue;
    // Base-title matching must not silently admit a numbered sequel/part.
    if (
      verified &&
      /^(?:\d+|ii|iii|iv|v|vi|vii|viii|ix|x|part \d+|chapter \d+)(?: |$)/.test(
        suffix,
      )
    )
      continue;
    return "MATCH";
  }
  if (!verified) return "UNKNOWN";
  const remainder = comparisonKey(title)
    .replace(/bande annonce|tráiler|трейлер|予告編?|예고편|预告|預告/gu, " ")
    .replace(
      /\b(official|trailer|teaser|launch|story|reveal|announcement|gameplay|video|hd|uhd|4k|final|main|new|season|preview|extended|look|glimpse|cinematic|\d+)\b/g,
      "",
    )
    .trim();
  return remainder.replace(/\s+/g, "").length > 3 ? "MISMATCH" : "UNKNOWN";
}
function boundEvidence(
  evidence: VideoEvidence | undefined,
  candidate: VideoCandidate,
): VideoEvidence | undefined {
  if (!evidence) return undefined;
  const url = new URL(evidence.referenceUrl);
  const id =
    url.hostname === "youtu.be"
      ? url.pathname.slice(1)
      : ["youtube.com", "www.youtube.com"].includes(url.hostname) &&
          url.pathname === "/watch"
        ? url.searchParams.get("v")
        : null;
  if (
    candidate.platform.toLowerCase() === "youtube" &&
    id !== candidate.externalKey
  )
    throw new Error("Video evidence reference does not match its candidate.");
  if (candidate.platform.toLowerCase() === "vimeo") {
    const vimeoId = ["vimeo.com", "www.vimeo.com"].includes(url.hostname)
      ? /^\/([1-9]\d{0,11})\/?$/.exec(url.pathname)?.[1]
      : null;
    if (
      vimeoId !== candidate.externalKey ||
      evidence.source === "YOUTUBE_DATA_API"
    )
      throw new Error("Video evidence reference does not match its candidate.");
  }
  return evidence;
}
function claimedLanguage(title: string, names: string[]): string | null {
  let value = removeNames(title, names);
  const languages = new Map([
    ["english", "en"],
    ["hindi", "hi"],
    ["tamil", "ta"],
    ["telugu", "te"],
    ["malayalam", "ml"],
    ["kannada", "kn"],
    ["japanese", "ja"],
    ["korean", "ko"],
    ["french", "fr"],
    ["german", "de"],
    ["spanish", "es"],
  ]);
  const words = [...languages.keys()].join("|");
  value = value
    .replace(
      new RegExp(
        `\\b(${words}) (?:subtitles?|subs?|subbed|captions?|cc)\\b`,
        "g",
      ),
      " ",
    )
    .replace(
      new RegExp(
        `\\b(?:subtitles?|subs?|captions?) (?:in )?(${words})\\b`,
        "g",
      ),
      " ",
    );
  const matches = [...languages].flatMap(([name, code]) =>
    new RegExp(
      `\\b(?:${name} (?:dub|audio|trailer|teaser)|(?:trailer|teaser) ${name}|dubbed (?:in )?${name})\\b`,
    ).test(value)
      ? [code]
      : [],
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}
function evaluateVideo(
  candidate: VideoCandidate,
  context: SelectionContext,
  policy: ReturnType<typeof validateSelectionPolicy>,
  rawEvidence?: VideoEvidence,
): VideoEvaluation {
  const key = videoCandidateKey(candidate),
    evidence = boundEvidence(rawEvidence, candidate);
  const metadataVerified =
    !!evidence?.title && evidence.source !== "PROVIDER_API";
  const technical =
    evidence?.source === "YOUTUBE_DATA_API" ? evidence : undefined;
  const title = metadataVerified
    ? (evidence.title ?? "")
    : (candidate.name ?? "");
  const label = classifyVideoLabel(title);
  const category =
    label?.category ??
    (!metadataVerified && candidate.type.state === "known"
      ? candidate.type.value
      : null);
  const titleAssociation = association(title, context.names, metadataVerified);
  const associationEvidence =
    titleAssociation !== "UNKNOWN"
      ? metadataVerified
        ? "VERIFIED_METADATA"
        : "PROVIDER_LABEL"
      : belongsToTitle(candidate.provenance.identity, context)
        ? "PROVIDER_SCOPE"
        : "NONE";
  const channel = evidence?.channelId;
  const uploaderVerified =
    !!channel &&
    candidate.platform.toLowerCase() === "youtube" &&
    (policy.trustedYoutubeChannelIds ?? []).includes(channel) &&
    metadataVerified;
  const reasons: SelectionReason[] = [];
  const reject = (code: string, message: string) =>
    reasons.push({ code, message });
  if (!belongsToTitle(candidate.provenance.identity, context))
    reject(
      "TITLE_OWNER_MISMATCH",
      "The provider reference is not mapped to this title.",
    );
  const platform = candidate.platform.toLowerCase();
  if (
    platform === "youtube"
      ? !/^[A-Za-z0-9_-]{11}$/.test(candidate.externalKey)
      : platform === "vimeo"
        ? !/^[1-9]\d{0,11}$/.test(candidate.externalKey)
        : true
  )
    reject(
      "INVALID_VIDEO_REFERENCE",
      "Unsupported platform or invalid external video key.",
    );
  if (evidence?.availability === "UNAVAILABLE")
    reject(
      "VIDEO_UNAVAILABLE",
      "Independent metadata reports an unavailable video.",
    );
  const withoutNames = removeNames(
    metadataVerified ? title : `${title} ${candidate.sourceType ?? ""}`,
    context.names,
  );
  const blockedPhrase = blocked.find((value) => phrase(withoutNames, value));
  if (metadataVerified && !label)
    reject(
      "NO_PROMOTIONAL_FORMAT",
      "The independently inspected title has no supported promotional format; a provider Trailer/Teaser label is insufficient.",
    );
  if (blockedPhrase)
    reject(
      "NON_PROMOTIONAL_OR_FAN_CONTENT",
      `Excluded video format: ${blockedPhrase}.`,
    );
  const baseGame =
    context.type === "GAME" &&
    !["DLC", "EXPANSION", "STANDALONE_EXPANSION", "EDITION"].includes(
      context.gameType ?? "",
    );
  if (
    baseGame &&
    unrelatedGamePromo.some((value) => phrase(withoutNames, value))
  )
    reject(
      "RELATED_CONTENT_PROMO",
      "This advertises supplemental content rather than the requested base game.",
    );
  if (
    context.type !== "GAME" &&
    (category === "GAMEPLAY" ||
      phrase(withoutNames, "gameplay") ||
      phrase(withoutNames, "deep dive"))
  )
    reject(
      "WRONG_CONTENT_FORMAT",
      "Gameplay does not describe this movie or series.",
    );
  if (titleAssociation === "MISMATCH")
    reject(
      "TITLE_ASSOCIATION_MISMATCH",
      "Verified video title conflicts with the requested title identity.",
    );
  if (technical?.embeddable === false)
    reject("NOT_EMBEDDABLE", "The video is reported as non-embeddable.");
  if (technical?.isShort)
    reject(
      "SHORT_FORM_VIDEO",
      "A Shorts upload is unsuitable for the primary promotional video.",
    );
  if (technical?.durationSeconds != null && technical.durationSeconds < 30)
    reject(
      "SHORT_PROMO_CUTDOWN",
      "A sub-30-second cutdown is not recommended as the primary promo.",
    );
  if (
    technical?.nativeWidth &&
    technical.nativeHeight &&
    technical.nativeWidth / technical.nativeHeight < 1.2
  )
    reject(
      "VERTICAL_OR_SQUARE_VIDEO",
      "Verified native video dimensions are unsuitable for the primary player.",
    );
  // This normalized field is explicit per-video audio, unlike providerLanguageCode.
  const audio =
    normalizeLanguageCode(technical?.audioLanguageCode) ??
    (candidate.languageCode.state === "known" &&
    candidate.languageCode.certainty === "PROVIDED"
      ? normalizeLanguageCode(candidate.languageCode.value)
      : null);
  const claim = claimedLanguage(title, context.names);
  const providerHint = normalizeLanguageCode(candidate.providerLanguageCode);
  const hint = audio ?? claim ?? providerHint;
  const languageEvidence = audio
    ? "EXPLICIT_AUDIO"
    : claim
      ? "TITLE_CLAIM"
      : providerHint
        ? "PROVIDER_HINT"
        : "UNKNOWN";
  const languages = [
    ...new Set([
      ...(policy.preferredLanguages ?? []).flatMap((value) => value ?? []),
      ...(context.originalLanguage ? [context.originalLanguage] : []),
    ]),
  ];
  const languagePosition = languagePreference(hint, languages);
  const reviewReasons = [
    ...(!label
      ? [
          "No reliable promotional format is identified; the provider type alone does not verify it.",
        ]
      : []),
    ...(!metadataVerified
      ? [
          "Video title is only a provider claim; no independent title metadata was supplied.",
        ]
      : []),
    ...(titleAssociation !== "MATCH"
      ? [
          "Title association is uncertain; inspect the actual video before selection.",
        ]
      : []),
    ...(!uploaderVerified
      ? ["Uploader identity has not been matched to a trusted channel ID."]
      : []),
    ...(!technical
      ? [
          "Native video duration/dimensions are unverified; iframe sizes are not native dimensions.",
        ]
      : []),
    ...(!audio
      ? [
          "Spoken audio language is unknown; provider/title language hints are not proof of dubbing.",
        ]
      : []),
    ...(technical?.durationSeconds && technical.durationSeconds > 1800
      ? ["Long-form video needs editorial review before primary use."]
      : []),
  ];
  // A specific official TMDB promo can be a provisional suggestion. Generic labels never suffice.
  const providerSuggestion =
    candidate.provenance.identity.provider === "TMDB" &&
    candidate.official.state === "known" &&
    candidate.official.value &&
    candidate.type.state === "known" &&
    ["TRAILER", "TEASER"].includes(candidate.type.value) &&
    titleAssociation === "MATCH" &&
    !!label;
  const verifiedSuggestion =
    metadataVerified &&
    uploaderVerified &&
    evidence.availability === "AVAILABLE" &&
    titleAssociation === "MATCH" &&
    !!label;
  const recommendable =
    !reasons.length &&
    (metadataVerified ? verifiedSuggestion : providerSuggestion) &&
    (!technical?.durationSeconds || technical.durationSeconds <= 1800);
  const factors = reasons.length
    ? []
    : [
        factor(
          "category",
          category === "TRAILER"
            ? 40
            : category === "TEASER"
              ? 20
              : category === "GAMEPLAY"
                ? 12
                : category === "OTHER"
                  ? 5
                  : 0,
          "Prefer a trailer, then teaser, gameplay or other relevant promotional fallback.",
        ),
        factor(
          "specificFormat",
          label &&
            [
              "Launch Trailer",
              "Story Trailer",
              "Final Trailer",
              "Main Trailer",
            ].includes(label.label)
            ? 10
            : label?.label === "Announcement Trailer"
              ? -5
              : 0,
          "Prefer a representative finished-title promo over an early announcement.",
        ),
        factor(
          "titleAssociation",
          titleAssociation === "MATCH" ? (metadataVerified ? 15 : 5) : 0,
          "Independent title identity outweighs a provider label.",
        ),
        factor(
          "verifiedSource",
          uploaderVerified ? 10 : 0,
          "Trust exact configured channel IDs, never copied display names or the word official.",
        ),
        factor(
          "providerOfficial",
          candidate.official.state === "known" && candidate.official.value
            ? 2
            : 0,
          "Provider authenticity is retained as a small claim, not independent verification.",
        ),
        factor(
          "language",
          languagePosition >= 0
            ? Math.max(1, 10 - languagePosition * 2) * (audio ? 1 : 0.2)
            : 0,
          "Explicit per-video audio metadata is stronger than title/provider metadata hints.",
        ),
      ];
  return {
    key,
    candidate,
    recommendationReason: null,
    state: reasons.length ? "REJECTED" : "ELIGIBLE",
    score: reasons.length
      ? null
      : round(factors.reduce((sum, value) => sum + value.points, 0)),
    factors,
    reasons,
    reviewReasons,
    recommendable,
    category,
    label: label?.label ?? null,
    classificationEvidence: label
      ? metadataVerified
        ? "VERIFIED_METADATA"
        : "INFERRED_LABEL"
      : category
        ? "PROVIDER"
        : "UNKNOWN",
    association: titleAssociation,
    associationEvidence,
    metadataVerified,
    externalEvidence: evidence ?? null,
    uploaderVerified,
    audioLanguageCode: audio,
    languageHint: hint,
    languageEvidence,
  };
}
export function rankVideoCandidates(
  candidates: readonly VideoCandidate[],
  context: SelectionContext,
  options: { policy?: SelectionPolicy; evidence?: VideoEvidence[] } = {},
): VideoSelection {
  if (candidates.length > 500)
    throw new Error("Catalogue video selection candidate budget exceeded.");
  const policy = validateSelectionPolicy(options.policy);
  const evidence = validateSelectionEvidence({
    videos: options.evidence ?? [],
  });
  const evidenceByKey = new Map(
    (evidence.videos ?? []).map((entry) => [entry.key, entry]),
  );
  const evaluated = candidates.map((candidate) =>
    evaluateVideo(
      candidate,
      context,
      policy,
      evidenceByKey.get(videoCandidateKey(candidate)),
    ),
  );
  evaluated.sort(
    (a, b) =>
      Number(b.state !== "REJECTED") - Number(a.state !== "REJECTED") ||
      Number(b.recommendable) - Number(a.recommendable) ||
      (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
      compareText(a.key, b.key) ||
      compareText(JSON.stringify(a.candidate), JSON.stringify(b.candidate)),
  );
  const unique = new Map<string, VideoEvaluation>(),
    duplicates: VideoSelection["duplicates"] = [];
  for (const value of evaluated) {
    if (unique.has(value.key))
      duplicates.push({ key: value.key, duplicateOf: value.key });
    else unique.set(value.key, value);
  }
  return {
    ...finishSelection([...unique.values()]),
    duplicates,
    sourceState: "KNOWN",
  };
}
