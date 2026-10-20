import type {
  MediaCandidate,
  Provenance,
  VideoCandidate,
} from "../../contracts.js";
import type { IgdbGame } from "./schemas.js";
import { clean, known, missing } from "./values.js";

export function media(raw: IgdbGame, source: Provenance): MediaCandidate[] {
  const candidates: MediaCandidate[] = [];
  function add(
    images: NonNullable<IgdbGame["artworks"]>,
    sourceType: "COVER" | "ARTWORK" | "SCREENSHOT",
  ) {
    for (const image of images)
      candidates.push({
        owner: { kind: "TITLE", identity: source.identity },
        purpose: sourceType === "COVER" ? "POSTER" : null,
        sourceType,
        providerAssetId: image.image_id,
        providerRecordId: image.id ? String(image.id) : null,
        sourceUrl: `https://images.igdb.com/igdb/image/upload/t_original/${image.image_id}.jpg`,
        width: image.width || null,
        height: image.height || null,
        languageCode: null,
        provenance: source,
      });
  }
  if (raw.cover) add([raw.cover], "COVER");
  add(raw.artworks ?? [], "ARTWORK");
  add(raw.screenshots ?? [], "SCREENSHOT");
  return candidates;
}
export function videos(raw: IgdbGame, source: Provenance) {
  if (raw.videos == null) return missing();
  return known<VideoCandidate[]>(
    raw.videos.map((video) => ({
      platform: "YouTube",
      externalKey: video.video_id,
      providerVideoId: String(video.id),
      name: clean(video.name),
      // Names alone do not verify trailer type, publisher authenticity or audio language.
      type: missing("UNSUPPORTED"),
      official: missing("UNSUPPORTED"),
      languageCode: missing("UNSUPPORTED"),
      provenance: source,
    })),
    source,
  );
}
