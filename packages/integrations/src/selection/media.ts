import type { MediaCandidate } from "../contracts.js";
import { providerIdentityKey } from "../identity.js";
import { normalizeLanguageCode } from "../normalization/text.js";
import {
  belongsToTitle,
  clamp,
  compareText,
  factor,
  finishSelection,
  languagePreference,
  round,
  type SelectionContext,
} from "./common.js";
import type {
  MediaEvaluation,
  MediaSelection,
  ScoreFactor,
  SelectionReason,
} from "./contracts.js";
import {
  mediaCandidateKey,
  validateSelectionEvidence,
  validateSelectionPolicy,
  type MediaEvidence,
  type SelectionPolicy,
  type VisualSignals,
} from "./evidence.js";

type Purpose = MediaEvaluation["purpose"];
const targetRatio = 16 / 9;
function manualHeroComposition(signals?: VisualSignals): string | null {
  switch (signals?.composition) {
    case "PROMOTIONAL_PORTRAIT":
      return "Posed promotional portrait";
    case "PROMOTIONAL_KEY_ART":
      return "Promotional key art or character montage";
    case "LOGO_CARD":
      return "Logo-only title card";
    default:
      return null;
  }
}
function supportedUrl(candidate: MediaCandidate): boolean {
  try {
    const url = new URL(candidate.sourceUrl);
    if (url.protocol !== "https:" || url.port || url.username || url.password)
      return false;
    if (candidate.provenance.identity.provider === "TMDB")
      return (
        url.hostname === "image.tmdb.org" && url.pathname.startsWith("/t/p/")
      );
    if (candidate.provenance.identity.provider === "IGDB")
      return (
        url.hostname === "images.igdb.com" &&
        url.pathname.startsWith("/igdb/image/upload/")
      );
    return (
      [
        "shared.steamstatic.com",
        "cdn.akamai.steamstatic.com",
        "cdn.cloudflare.steamstatic.com",
      ].includes(url.hostname) && /^\/steam\/apps\//.test(url.pathname)
    );
  } catch {
    return false;
  }
}
function eligibility(
  candidate: MediaCandidate,
  purpose: Purpose,
  context: SelectionContext,
  signals?: VisualSignals,
): SelectionReason[] {
  const reasons: SelectionReason[] = [];
  const reject = (code: string, message: string) =>
    reasons.push({ code, message });
  if (
    candidate.owner.kind !== "TITLE" ||
    !belongsToTitle(candidate.owner.identity, context) ||
    !belongsToTitle(candidate.provenance.identity, context)
  )
    reject("OWNER_MISMATCH", "The image is not mapped to this title.");
  if (!supportedUrl(candidate))
    reject(
      "UNSUPPORTED_SOURCE_URL",
      "Use a supported provider image origin over HTTPS.",
    );
  const allowed =
    purpose === "POSTER"
      ? context.type === "GAME"
        ? ["COVER", "POSTER"]
        : ["POSTER"]
      : ["BACKDROP", "ARTWORK", "SCREENSHOT"];
  if (!allowed.includes(candidate.sourceType))
    reject(
      "UNSUITABLE_SOURCE_TYPE",
      `This source type is not suitable for ${purpose}.`,
    );
  if (
    candidate.provenance.identity.provider === "STEAM" &&
    (purpose !== "HERO_ART" || candidate.sourceType !== "SCREENSHOT")
  )
    reject(
      "UNSUPPORTED_STEAM_MEDIA",
      "Only confirmed title-owned Steam screenshots can be hero fallbacks.",
    );
  if (signals?.broken)
    reject(
      "BROKEN_IMAGE",
      "Independent inspection reports an unreadable source image.",
    );
  const { width, height } = candidate;
  const minimumWidth = purpose === "HERO_ART" ? 960 : 200;
  const minimumHeight =
    purpose === "HERO_ART" ? 540 : context.type === "GAME" ? 200 : 300;
  if (
    (width !== null && (!Number.isFinite(width) || width < minimumWidth)) ||
    (height !== null && (!Number.isFinite(height) || height < minimumHeight))
  )
    reject(
      "INSUFFICIENT_RESOLUTION",
      `Requires at least ${minimumWidth} × ${minimumHeight} source pixels.`,
    );
  if (width && height) {
    const ratio = width / height;
    if (
      purpose === "HERO_ART"
        ? ratio < 1.5 || ratio > 2.4
        : ratio < 0.45 || ratio > (context.type === "GAME" ? 1.35 : 1)
    )
      reject(
        "UNSUITABLE_ASPECT_RATIO",
        "Source geometry is unsuitable for this media purpose.",
      );
    if (width * height > 40_000_000)
      reject(
        "EXCESSIVE_PIXEL_AREA",
        "Provider dimensions exceed the initial 40 megapixel input ceiling.",
      );
  }
  return reasons;
}
function providerFactors(candidate: MediaCandidate): ScoreFactor[] {
  return [
    factor(
      "providerQuality",
      clamp(candidate.providerVoteAverage ?? 0, 0, 10) * 0.3 +
        clamp(Math.log10((candidate.providerVoteCount ?? 0) + 1), 0, 2) * 0.5,
      "Provider votes are a small quality hint, not editorial approval.",
    ),
    factor(
      "providerPrimary",
      candidate.providerPrimary ? 0.5 : 0,
      "Provider primary selection is only a small tie-breaker.",
    ),
  ];
}
function posterFactors(
  candidate: MediaCandidate,
  context: SelectionContext,
  languages: string[],
  signals?: VisualSignals,
): ScoreFactor[] {
  const ratio =
    candidate.width && candidate.height
      ? candidate.width / candidate.height
      : null;
  const language = normalizeLanguageCode(candidate.languageCode);
  const preferences = [
    ...new Set([
      ...languages,
      ...(context.originalLanguage ? [context.originalLanguage] : []),
    ]),
  ];
  const position = languagePreference(language, preferences);
  return [
    factor(
      "aspectRatio",
      ratio === null ? 0 : 20 * clamp(1 - Math.abs(ratio - 2 / 3) / 1.1),
      "Portrait composition is preferred; square legacy game covers remain valid.",
    ),
    factor(
      "resolution",
      12 *
        clamp(((candidate.width ?? 0) * (candidate.height ?? 0)) / 1_500_000),
      "Resolution benefit is capped at a 1000 × 1500 source.",
    ),
    factor(
      "language",
      position >= 0 ? Math.max(2, 7 - position * 2) : language === null ? 1 : 0,
      "Prefer configured/original-language poster variants without excluding other languages.",
    ),
    factor(
      "clutter",
      -8 * (signals?.overlayComplexity ?? 0),
      "Measured clutter lowers suitability without rejecting valid artwork.",
    ),
    factor(
      "promotionalText",
      -30 * clamp(((signals?.textLikelihood ?? 0) - 0.6) / 0.4),
      "Only strongly text-dominated posters are penalized; ordinary poster lettering is expected.",
    ),
    ...providerFactors(candidate),
  ];
}
function heroFactors(
  candidate: MediaCandidate,
  context: SelectionContext,
  signals?: VisualSignals,
): ScoreFactor[] {
  const ratio =
    candidate.width && candidate.height
      ? candidate.width / candidate.height
      : null;
  const brightness = signals?.averageBrightness ?? 0.4;
  const detail = signals?.detailSpread ?? 0.5;
  const focal = 1 - Math.abs((signals?.focalRightBias ?? 0.5) - 0.55);
  const geometry = [
    factor(
      "aspectRatio",
      ratio === null ? 0 : 14 * clamp(1 - Math.abs(ratio - targetRatio) / 0.5),
      "Prefer a cinematic ratio near 16:9; account for crop suitability.",
    ),
    factor(
      "resolution",
      10 *
        clamp(
          ((candidate.width ?? 0) * (candidate.height ?? 0)) / (1920 * 1080),
        ),
      "Geometry cannot overpower composition: no extra points beyond 1080p.",
    ),
  ];
  const text = Math.max(
    signals?.textLikelihood ?? 0,
    (signals?.cornerTextLikelihood ?? 0) * 0.65,
  );
  const shared = [
    factor(
      "promotionalComposition",
      manualHeroComposition(signals) ? -24 : 0,
      "An explicit promotional composition assessment favors a scene backdrop instead; the source remains available for manual selection.",
    ),
    factor(
      "text",
      -(context.type === "GAME"
        ? 40 * clamp((text - 0.08) / 0.65)
        : 55 * clamp(((text - 0.045) * 150) / 55)),
      "Measured text/logo-like contrast is a heuristic penalty, never OCR or a technical rejection.",
    ),
    factor(
      "letterbox",
      -10 * (signals?.letterboxLikelihood ?? 0),
      "Letterboxing reduces the usable crop.",
    ),
    factor(
      "analysisUnavailable",
      signals ? 0 : -12,
      "No visual analysis: geometry-only suggestion needs editorial inspection.",
    ),
  ];
  if (context.type === "GAME")
    return [
      ...geometry,
      factor(
        "scene",
        candidate.sourceType === "SCREENSHOT" ? 8 : 0,
        "A modest scene prior; clean artwork can still beat a cluttered screenshot.",
      ),
      factor(
        "composition",
        16 *
          ((signals?.dynamicRange ?? 0.5) * 0.4 + detail * 0.35 + focal * 0.25),
        "Measured dynamic range, scene detail and focal placement favor useful composition.",
      ),
      factor(
        "overlayReadability",
        8 * (1 - (signals?.overlayComplexity ?? 0.5)),
        "Prefer lower detail behind the dark hero text overlay.",
      ),
      factor(
        "exposure",
        12 * clamp(brightness / 0.3) * (1 - clamp((brightness - 0.85) / 0.15)),
        "Preserve visible night scenes while avoiding near-black or washed-out banners.",
      ),
      factor(
        "hud",
        candidate.sourceType === "SCREENSHOT"
          ? -36 * clamp(((signals?.hudLikelihood ?? 0) - 0.2) / 0.65)
          : 0,
        "HUD-heavy gameplay screenshots rank below clean cinematic imagery.",
      ),
      factor(
        "coverSimilarity",
        candidate.sourceType === "ARTWORK"
          ? -20 * clamp(((signals?.coverSimilarity ?? 0) - 0.82) / 0.18)
          : 0,
        "Cover resemblance lowers artwork rank; it does not prove duplication.",
      ),
      ...shared,
    ];
  const empty =
    1 - clamp(Math.abs((signals?.emptySpace ?? 0.28) - 0.52) / 0.52);
  return [
    ...geometry,
    factor(
      "naturalScene",
      14 *
        ((1 - clamp(Math.abs((signals?.saturation ?? 0.36) - 0.36) / 0.42)) *
          0.45 +
          (1 - clamp(Math.abs(brightness - 0.43) / 0.43)) * 0.25 +
          (signals?.dynamicRange ?? 0.55) * 0.2 +
          detail * 0.1),
      "Prefer natural scene exposure, color and distributed detail.",
    ),
    factor(
      "composition",
      18 *
        ((signals?.dynamicRange ?? 0.55) * 0.22 +
          detail * 0.46 +
          focal * 0.2 +
          empty * 0.12),
      "Scene breadth, focal subject and useful negative space support a readable crop.",
    ),
    factor(
      "overlayReadability",
      signals
        ? clamp(
            (1 - (signals.overlayComplexity ?? 0.5)) * 4 +
              (1 - (signals.overlayBrightness ?? 0.5)) * 1.5 +
              empty * 0.5,
            0,
            6,
          )
        : 3,
      "Prefer negative space and low overlay complexity.",
    ),
    factor(
      "localizedTextHint",
      candidate.languageCode ? -8 : 4,
      "Provider image-language tags can indicate localized artwork; this is not verified text detection.",
    ),
    factor(
      "flatPromotion",
      -clamp(
        Math.max(0, brightness - 0.61) * 18 +
          Math.max(0, (signals?.saturation ?? 0.35) - 0.55) * 22,
        0,
        14,
      ),
      "Bright, flat promotional compositions receive a bounded penalty.",
    ),
    ...shared,
    ...providerFactors(candidate),
  ];
}
export function rankMediaCandidates(
  candidates: readonly MediaCandidate[],
  context: SelectionContext,
  purpose: Purpose,
  options: { policy?: SelectionPolicy; evidence?: MediaEvidence[] } = {},
): MediaSelection {
  if (candidates.length > 2000)
    throw new Error("Catalogue media selection candidate budget exceeded.");
  const policy = validateSelectionPolicy(options.policy);
  const evidence = validateSelectionEvidence({ media: options.evidence ?? [] });
  const signalsByKey = new Map(
    (evidence.media ?? []).map((entry) => [entry.key, entry]),
  );
  const evaluated = candidates.map((candidate): MediaEvaluation => {
    const key = mediaCandidateKey(candidate),
      inspection = signalsByKey.get(key);
    const signals =
      inspection &&
      Object.keys(inspection.signals).some((name) => name !== "broken")
        ? inspection.signals
        : undefined;
    const reasons = eligibility(
      candidate,
      purpose,
      context,
      inspection?.signals,
    );
    const dimensionsKnown =
      candidate.width !== null && candidate.height !== null;
    const factors = reasons.length
      ? []
      : purpose === "POSTER"
        ? posterFactors(
            candidate,
            context,
            policy.preferredLanguages?.flatMap((value) => value ?? []) ?? [],
            signals,
          )
        : heroFactors(candidate, context, signals);
    const score = round(
      factors.reduce((total, value) => total + value.points, 0),
    );
    const needsVisualReview =
      purpose === "HERO_ART" &&
      (manualHeroComposition(signals) !== null ||
        score < 20 ||
        (signals?.textLikelihood ?? 0) > 0.82 ||
        (signals?.cornerTextLikelihood ?? 0) > 0.9 ||
        (signals?.hudLikelihood ?? 0) > 0.9);
    const reviewReasons = [
      ...(!dimensionsKnown
        ? [
            "Dimensions are unknown; inspect and validate before making a recommendation.",
          ]
        : []),
      ...(!signals
        ? [
            "Visual signals are unavailable; inspect composition, crop and embedded text.",
          ]
        : []),
      ...(signals &&
      purpose === "HERO_ART" &&
      [
        "averageBrightness",
        "dynamicRange",
        "detailSpread",
        "overlayComplexity",
      ].some((key) => !Object.hasOwn(signals, key))
        ? [
            "Visual evidence is partial; unmeasured scoring factors use neutral baselines.",
          ]
        : []),
      ...(factors.some(
        (value) =>
          ["text", "promotionalText", "hud"].includes(value.name) &&
          value.points <= -18,
      )
        ? [
            "Text, logos or HUD clutter may impair the public layout; still available for editorial selection.",
          ]
        : []),
      ...(needsVisualReview
        ? [
            "Visual suitability requires manual review; no automatic hero recommendation.",
          ]
        : []),
      ...(purpose === "HERO_ART" && manualHeroComposition(signals)
        ? [
            `${manualHeroComposition(signals)}: prefer an in-scene backdrop for the content-page hero.`,
          ]
        : []),
    ];
    return {
      key,
      candidate,
      recommendationReason: null,
      purpose,
      state: reasons.length ? "REJECTED" : "ELIGIBLE",
      score: reasons.length ? null : score,
      factors,
      reasons,
      reviewReasons,
      recommendable: !reasons.length && dimensionsKnown && !needsVisualReview,
      analysis: signals ? "AVAILABLE" : "UNAVAILABLE",
      analysisMethod: inspection?.method ?? null,
      visualSignals: inspection?.signals ?? null,
    };
  });
  // Deduplicate after eligibility, so an incomplete duplicate cannot hide a valid reference.
  const ordered = [...evaluated].sort(
    (a, b) =>
      Number(b.state !== "REJECTED") - Number(a.state !== "REJECTED") ||
      Number(b.recommendable) - Number(a.recommendable) ||
      (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
      compareText(a.key, b.key) ||
      compareText(JSON.stringify(a.candidate), JSON.stringify(b.candidate)),
  );
  const unique: MediaEvaluation[] = [],
    duplicates: MediaSelection["duplicates"] = [];
  const seenAssets = new Map<string, string>(),
    seenUrls = new Map<string, string>();
  for (const entry of ordered) {
    const owner = providerIdentityKey(entry.candidate.owner.identity);
    const identity = JSON.stringify([
      owner,
      entry.candidate.provenance.identity.provider,
      entry.candidate.providerAssetId ?? entry.candidate.sourceUrl,
    ]);
    const urlKey = owner + ":" + entry.candidate.sourceUrl;
    const previous = seenAssets.get(identity) ?? seenUrls.get(urlKey);
    if (previous) duplicates.push({ key: entry.key, duplicateOf: previous });
    else unique.push(entry);
    seenAssets.set(identity, previous ?? entry.key);
    seenUrls.set(urlKey, previous ?? entry.key);
  }
  // Confirmed Steam screenshots are fallback suggestions, never an implicit identity match.
  if (
    context.type === "GAME" &&
    unique.some(
      (value) =>
        value.state !== "REJECTED" &&
        value.recommendable &&
        value.candidate.provenance.identity.provider === "IGDB",
    )
  ) {
    for (const value of unique.filter(
      (entry) => entry.candidate.provenance.identity.provider === "STEAM",
    )) {
      value.recommendable = false;
      value.reviewReasons.push(
        "A usable IGDB image exists; this confirmed Steam reference remains an editorial alternative.",
      );
    }
  }
  return {
    ...finishSelection(unique),
    duplicates: duplicates.sort((a, b) => compareText(a.key, b.key)),
    sourceState: "KNOWN",
  };
}
