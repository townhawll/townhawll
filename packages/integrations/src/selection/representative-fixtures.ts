import { known, missing } from "../candidate-fields.js";
import type { TitleDetailsCandidate } from "../catalogue-candidates.js";
import { mediaCandidateSchema, videoCandidateSchema } from "../contracts.js";
import { normalizeGame } from "../providers/igdb/normalize.js";
import { gameSchema } from "../providers/igdb/schemas.js";
import { movie, series } from "../providers/tmdb/fixtures.js";
import { normalizeTitle } from "../providers/tmdb/normalize.js";
import { movieSchema, seriesSchema } from "../providers/tmdb/schemas.js";
import {
  mediaCandidateKey,
  visualSignalsSchema,
  videoCandidateKey,
  type SelectionEvidence,
} from "./evidence.js";
import { instant } from "./fixtures.js";
import recorded from "./fixtures/representative-media.json" with { type: "json" };

export type RepresentativeFixture = {
  candidate: TitleDetailsCandidate;
  evidence: SelectionEvidence;
  playgroundHero: string | null;
  comparison: "RECORDED_GAME" | "RECORDED_VIDEO" | "SYNTHETIC_ADAPTER";
};
const games: RepresentativeFixture[] = recorded.games.map((record) => {
  const candidate = normalizeGame(
    gameSchema.parse({
      id: Number(record.id),
      name: record.title,
      game_type: { type: "Main Game" },
    }),
    instant,
  );
  const source = candidate.title.mappings[0];
  if (!source) throw new Error("Missing representative provenance.");
  const media = record.candidates.map((entry) =>
    mediaCandidateSchema.parse({
      owner: { kind: "TITLE", identity: candidate.title.identity },
      purpose: null,
      sourceType: entry.type,
      providerAssetId: entry.id,
      sourceUrl: entry.url,
      width: entry.width,
      height: entry.height,
      languageCode: null,
      provenance: source,
    }),
  );
  const evidence = record.candidates.flatMap((entry, index) => {
    const image = media[index];
    const review = "visualReview" in entry ? entry.visualReview : null;
    return image && (entry.signals || review)
      ? [
          {
            key: mediaCandidateKey(image),
            method: review
              ? entry.signals
                ? "recorded-playground-pixel-heuristics+editorial-visual-review"
                : "editorial-visual-review"
              : "recorded-playground-pixel-heuristics",
            signals: visualSignalsSchema.parse({
              ...entry.signals,
              ...(review ? { composition: review.composition } : {}),
            }),
          },
        ]
      : [];
  });
  if (record.posterUrl)
    media.push(
      mediaCandidateSchema.parse({
        owner: { kind: "TITLE", identity: candidate.title.identity },
        purpose: "POSTER",
        sourceType: "COVER",
        providerAssetId: record.posterUrl.split("/").at(-1),
        sourceUrl: record.posterUrl,
        width: null,
        height: null,
        languageCode: null,
        provenance: source,
      }),
    );
  candidate.title.media = known(media, source);
  return {
    candidate,
    evidence: { media: evidence },
    playgroundHero: record.playgroundHero,
    comparison: "RECORDED_GAME",
  };
});
const screen: RepresentativeFixture[] = recorded.screen.map((record) => {
  const review = "backdropReview" in record ? record.backdropReview : null;
  const raw =
    record.type === "MOVIE"
      ? movieSchema.parse({ id: Number(record.id), title: record.title })
      : seriesSchema.parse({ id: Number(record.id), name: record.title });
  const candidate = normalizeTitle(raw, instant);
  const source = candidate.title.mappings[0];
  if (!source) throw new Error("Missing representative provenance.");
  const media = [
    ...(record.posterUrl
      ? [{ url: record.posterUrl, purpose: "POSTER", type: "POSTER" }]
      : []),
    ...(record.recordedBackdropUrl
      ? [
          {
            url: record.recordedBackdropUrl,
            purpose: "HERO_ART",
            type: "BACKDROP",
          },
        ]
      : []),
  ].map((image) =>
    mediaCandidateSchema.parse({
      owner: { kind: "TITLE", identity: candidate.title.identity },
      purpose: image.purpose,
      sourceType: image.type,
      providerAssetId: image.url.split("/").at(-1),
      sourceUrl: image.url,
      width: image.purpose === "HERO_ART" ? (review?.width ?? null) : null,
      height: image.purpose === "HERO_ART" ? (review?.height ?? null) : null,
      languageCode: null,
      provenance: source,
    }),
  );
  const videos = record.videos.map((entry) =>
    videoCandidateSchema.parse({
      platform: "YouTube",
      externalKey: entry.key,
      providerVideoId: entry.key,
      type: entry.providerType
        ? known(
            entry.providerType === "Trailer"
              ? "TRAILER"
              : entry.providerType === "Teaser"
                ? "TEASER"
                : "OTHER",
            source,
          )
        : missing(),
      name: entry.providerName,
      official:
        entry.providerOfficial === null
          ? missing()
          : known(entry.providerOfficial, source),
      languageCode: missing("UNSUPPORTED"),
      provenance: source,
    }),
  );
  const evidence = record.videos.flatMap((entry, index) => {
    const video = videos[index];
    return video
      ? [
          {
            key: videoCandidateKey(video),
            source: "OEMBED" as const,
            referenceUrl: `https://www.youtube.com/watch?v=${video.externalKey}`,
            checkedAt: record.checkedAt,
            title: entry.title,
            channelId: entry.channelId,
            availability:
              entry.available === true
                ? ("AVAILABLE" as const)
                : entry.available === false
                  ? ("UNAVAILABLE" as const)
                  : ("UNKNOWN" as const),
          },
        ]
      : [];
  });
  candidate.title.media = known(media, source);
  candidate.title.videos = known(videos, source);
  const backdrop = media.find((image) => image.sourceType === "BACKDROP");
  return {
    candidate,
    evidence: {
      videos: evidence,
      media:
        review && backdrop
          ? [
              {
                key: mediaCandidateKey(backdrop),
                method: review.method,
                signals: visualSignalsSchema.parse({
                  composition: review.composition,
                }),
              },
            ]
          : [],
    },
    playgroundHero: null,
    comparison: "RECORDED_VIDEO",
  };
});
export const representativeFixtures: RepresentativeFixture[] = [
  ...games,
  ...screen,
  {
    candidate: normalizeTitle(movieSchema.parse(movie), instant),
    evidence: {},
    playgroundHero: null,
    comparison: "SYNTHETIC_ADAPTER",
  },
  {
    candidate: normalizeTitle(seriesSchema.parse(series), instant),
    evidence: {},
    playgroundHero: null,
    comparison: "SYNTHETIC_ADAPTER",
  },
];
