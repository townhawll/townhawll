import type { TitleDetailsCandidate } from "../catalogue-candidates.js";
import type { TitleCandidate } from "../contracts.js";
import { sourceState, type SelectionContext } from "./common.js";
import type { CatalogueRecommendations } from "./contracts.js";
import {
  validateSelectionEvidence,
  validateSelectionPolicy,
  type SelectionEvidence,
  type SelectionPolicy,
} from "./evidence.js";
import { rankMediaCandidates } from "./media.js";
import { rankVideoCandidates } from "./videos.js";

export * from "./contracts.js";
export * from "./evidence.js";
export { rankMediaCandidates } from "./media.js";
export { rankVideoCandidates, classifyVideoLabel } from "./videos.js";
export type { SelectionContext } from "./common.js";

export function selectionContext(title: TitleCandidate): SelectionContext {
  const language =
    title.type === "GAME"
      ? title.metadata.primaryLanguageCode
      : title.metadata.originalLanguageCode;
  return {
    identity: title.identity,
    mappings: title.mappings,
    type: title.type,
    names: [
      ...new Set([
        title.title,
        ...(title.originalTitle.state === "known"
          ? [title.originalTitle.value]
          : []),
        ...(title.aliases.state === "known"
          ? title.aliases.value.map((alias) => alias.name)
          : []),
      ]),
    ],
    originalLanguage: language.state === "known" ? language.value : null,
    gameType: title.type === "GAME" ? title.metadata.gameType : null,
  };
}
/** Suggestions only. Raw candidates remain untouched and admin acceptance is a later operation. */
export function recommendCatalogueMedia(
  candidate: Pick<TitleDetailsCandidate, "title">,
  options: { policy?: SelectionPolicy; evidence?: SelectionEvidence } = {},
): CatalogueRecommendations {
  const policy = validateSelectionPolicy(options.policy);
  const evidence = validateSelectionEvidence(options.evidence);
  const context = selectionContext(candidate.title);
  const media =
    candidate.title.media.state === "known" ? candidate.title.media.value : [];
  const video =
    candidate.title.videos.state === "known"
      ? candidate.title.videos.value
      : [];
  const poster = rankMediaCandidates(media, context, "POSTER", {
    policy,
    evidence: evidence.media ?? [],
  });
  const hero = rankMediaCandidates(media, context, "HERO_ART", {
    policy,
    evidence: evidence.media ?? [],
  });
  const videos = rankVideoCandidates(video, context, {
    policy,
    evidence: evidence.videos ?? [],
  });
  return {
    poster: { ...poster, sourceState: sourceState(candidate.title.media) },
    hero: { ...hero, sourceState: sourceState(candidate.title.media) },
    video: { ...videos, sourceState: sourceState(candidate.title.videos) },
  };
}
