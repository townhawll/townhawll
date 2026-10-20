import { known, missing } from "../candidate-fields.js";
import type {
  MediaCandidate,
  VideoCandidate,
  Provenance,
} from "../contracts.js";
import type { SelectionContext } from "./common.js";
import {
  mediaCandidateKey,
  videoCandidateKey,
  type MediaEvidence,
  type VideoEvidence,
  type VisualSignals,
} from "./evidence.js";

export const instant = "2026-10-21T00:00:00.000Z";
export const gameContext: SelectionContext = {
  identity: { provider: "IGDB", entity: "game", id: "1" },
  mappings: [],
  type: "GAME",
  names: ["Example Adventure"],
  originalLanguage: null,
  gameType: "MAIN_GAME",
};
export const movieContext: SelectionContext = {
  identity: { provider: "TMDB", entity: "movie", id: "1" },
  mappings: [],
  type: "MOVIE",
  names: ["Example Film"],
  originalLanguage: "en",
  gameType: null,
};
export function source(context = gameContext): Provenance {
  return {
    identity: context.identity,
    fetchedAt: instant,
    sourceUpdatedAt: null,
    sourceUrl: null,
  };
}
export function image(
  id: string,
  patch: Partial<MediaCandidate> = {},
  context = gameContext,
): MediaCandidate {
  return {
    owner: { kind: "TITLE", identity: context.identity },
    purpose: null,
    sourceType: context.type === "GAME" ? "SCREENSHOT" : "BACKDROP",
    providerAssetId: id,
    sourceUrl:
      context.type === "GAME"
        ? `https://images.igdb.com/igdb/image/upload/t_original/${id}.jpg`
        : `https://image.tmdb.org/t/p/original/${id}.jpg`,
    width: 1920,
    height: 1080,
    languageCode: null,
    provenance: source(context),
    ...patch,
  };
}
export function scene(patch: Partial<VisualSignals> = {}): VisualSignals {
  return {
    broken: false,
    averageBrightness: 0.4,
    dynamicRange: 0.8,
    detailSpread: 0.7,
    focalRightBias: 0.6,
    emptySpace: 0.3,
    overlayComplexity: 0.3,
    overlayBrightness: 0.4,
    saturation: 0.35,
    textLikelihood: 0.02,
    cornerTextLikelihood: 0.01,
    hudLikelihood: 0.05,
    letterboxLikelihood: 0,
    ...patch,
  };
}
export function inspection(
  candidate: MediaCandidate,
  signals = scene(),
): MediaEvidence {
  return {
    key: mediaCandidateKey(candidate),
    method: "synthetic-regression-signals",
    signals,
  };
}
export function video(
  key = "video000001",
  patch: Partial<VideoCandidate> = {},
  context = gameContext,
): VideoCandidate {
  return {
    platform: "YouTube",
    externalKey: key,
    providerVideoId: "1",
    type: missing("UNSUPPORTED"),
    name: "Trailer",
    official: missing("UNSUPPORTED"),
    languageCode: missing("UNSUPPORTED"),
    provenance: source(context),
    ...patch,
  };
}
export const channelId = `UC${"a".repeat(22)}`;
export function verification(
  candidate: VideoCandidate,
  title = "Example Adventure Official Trailer",
  patch: Partial<VideoEvidence> = {},
): VideoEvidence {
  return {
    key: videoCandidateKey(candidate),
    source: "YOUTUBE_DATA_API",
    referenceUrl: `https://www.youtube.com/watch?v=${candidate.externalKey}`,
    checkedAt: instant,
    title,
    channelId,
    availability: "AVAILABLE",
    durationSeconds: 120,
    nativeWidth: 1920,
    nativeHeight: 1080,
    embeddable: true,
    isShort: false,
    ...patch,
  };
}
export const providedTrailer = (context = movieContext) => ({
  type: known("TRAILER" as const, source(context)),
  official: known(true, source(context)),
});
