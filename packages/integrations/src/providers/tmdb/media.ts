import type {
  CandidateField,
  MediaCandidate,
  Provenance,
  VideoCandidate,
} from "../../contracts.js";
import type { TmdbImages, TmdbVideos } from "./schemas.js";
import {
  clean,
  country,
  imageUrl,
  known,
  language,
  mapField,
  missing,
} from "./values.js";

export function normalizeImages(
  images: CandidateField<TmdbImages>,
  owner: MediaCandidate["owner"],
  source: Provenance,
  primary: {
    poster?: string | null | undefined;
    backdrop?: string | null | undefined;
    profile?: string | null | undefined;
  },
): CandidateField<MediaCandidate[]> {
  const candidates = new Map<string, MediaCandidate>();
  const groups =
    owner.kind === "PERSON"
      ? (["profiles"] as const)
      : owner.kind === "SEASON"
        ? (["posters"] as const)
        : (["posters", "backdrops"] as const);
  for (const group of groups) {
    const primaryPath =
      group === "profiles"
        ? primary.profile
        : group === "posters"
          ? primary.poster
          : primary.backdrop;
    for (const image of images.state === "known"
      ? (images.value[group] ?? [])
      : []) {
      const url = imageUrl(image.file_path);
      if (!url) continue;
      candidates.set(`${group}:${image.file_path}`, {
        owner,
        purpose:
          group === "profiles"
            ? "PERSON_IMAGE"
            : group === "posters"
              ? "POSTER"
              : "HERO_ART",
        sourceType:
          group === "profiles"
            ? "PROFILE"
            : group === "posters"
              ? "POSTER"
              : "BACKDROP",
        providerAssetId: image.file_path,
        sourceUrl: url,
        width: image.width && image.width > 0 ? image.width : null,
        height: image.height && image.height > 0 ? image.height : null,
        languageCode: language(image.iso_639_1),
        provenance: source,
        providerPrimary: image.file_path === primaryPath,
        providerVoteAverage: image.vote_average ?? null,
        providerVoteCount: image.vote_count ?? null,
      });
    }
    if (primaryPath && !candidates.has(`${group}:${primaryPath}`)) {
      const url = imageUrl(primaryPath);
      if (url)
        candidates.set(`${group}:${primaryPath}`, {
          owner,
          purpose:
            group === "profiles"
              ? "PERSON_IMAGE"
              : group === "posters"
                ? "POSTER"
                : "HERO_ART",
          sourceType:
            group === "profiles"
              ? "PROFILE"
              : group === "posters"
                ? "POSTER"
                : "BACKDROP",
          providerAssetId: primaryPath,
          sourceUrl: url,
          width: null,
          height: null,
          languageCode: null,
          provenance: source,
          providerPrimary: true,
        });
    }
  }
  return candidates.size || images.state === "known"
    ? known([...candidates.values()], source)
    : images;
}

export function normalizeVideos(
  videos: CandidateField<TmdbVideos>,
  source: Provenance,
): CandidateField<VideoCandidate[]> {
  return mapField(videos, (data) => {
    const unique = new Map<string, VideoCandidate>();
    for (const video of data.results) {
      const rawType = clean(video.type);
      const type =
        rawType === "Trailer"
          ? "TRAILER"
          : rawType === "Teaser"
            ? "TEASER"
            : "OTHER";
      unique.set(video.id, {
        platform: video.site,
        externalKey: video.key,
        providerVideoId: video.id,
        type: rawType ? known(type, source) : missing(),
        sourceType: rawType,
        name: clean(video.name),
        official:
          video.official === null || video.official === undefined
            ? missing()
            : known(video.official, source),
        // TMDB's metadata language is not independent evidence of the spoken audio.
        languageCode: missing("UNSUPPORTED"),
        providerLanguageCode: language(video.iso_639_1),
        regionCode: country(video.iso_3166_1),
        publishedAt: clean(video.published_at),
        resolution: video.size && video.size > 0 ? video.size : null,
        provenance: source,
      });
    }
    return [...unique.values()];
  });
}
