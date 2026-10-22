import { createHash } from "node:crypto";
import { titleDetailsCandidateSchema } from "@townhawll/integrations/catalogue-candidates";
import { gameDetailsCandidateSchema } from "@townhawll/integrations/game-candidates";
import { gameSupplementCandidateSchema } from "@townhawll/integrations/game-supplements";
import {
  mediaCandidateKey,
  videoCandidateKey,
  selectionContext,
  rankMediaCandidates,
  rankVideoCandidates,
  isSupportedMediaSource,
} from "@townhawll/integrations/selection";
import { providerIdentityKey } from "@townhawll/integrations/identity";
import type {
  CandidateField,
  MediaCandidate,
} from "@townhawll/integrations/contracts";
import { z } from "zod";

import {
  importIdentitySchema,
  type ImportValidationIssue,
} from "./contracts.ts";

const sourceSchema = z.union([
  gameDetailsCandidateSchema,
  titleDetailsCandidateSchema.refine((value) => value.title.type !== "GAME"),
]);
const submissionSchema = z
  .strictObject({
    // A reviewed transport envelope, separate from provider output and not a persistence input.
    candidate: sourceSchema,
    gameSupplement: gameSupplementCandidateSchema.optional(),
    canonical: z.strictObject({
      type: z.enum(["MOVIE", "SERIES", "GAME"]),
      title: z.string().trim().min(1).max(500),
      slug: z
        .string()
        .min(1)
        .max(200)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    }),
    selectedMedia: z
      .array(
        z.strictObject({
          key: z.string().min(1).max(4096),
          purpose: z.enum(["POSTER", "HERO_ART", "PERSON_IMAGE", "LOGO"]),
        }),
      )
      .max(100)
      .default([]),
    selectedVideos: z.array(z.string().min(1).max(200)).max(20).default([]),
  })
  .brand<"ValidatedImportSubmission">();
export type ValidatedImportSubmission = z.infer<typeof submissionSchema>;
export type ImportSubmission = z.input<typeof submissionSchema>;
export type ImportValidationResult =
  | {
      valid: true;
      data: ValidatedImportSubmission;
      errors: [];
      warnings: ImportValidationIssue[];
      missing: string[];
    }
  | {
      valid: false;
      errors: ImportValidationIssue[];
      warnings: ImportValidationIssue[];
      missing: string[];
    };

function values<T>(field: CandidateField<T[]>): T[] {
  return field.state === "known" ? field.value : [];
}
export function validateImportSubmission(
  input: unknown,
): ImportValidationResult {
  const errors: ImportValidationIssue[] = [],
    warnings: ImportValidationIssue[] = [],
    missing: string[] = [];
  const issue = (code: string, path: string) => errors.push({ code, path });
  let parsed: ReturnType<typeof submissionSchema.safeParse>;
  try {
    if (
      new TextEncoder().encode(JSON.stringify(input)).byteLength >
      2 * 1024 * 1024
    )
      throw new Error();
    parsed = submissionSchema.safeParse(input);
  } catch {
    return {
      valid: false,
      errors: [{ code: "INVALID_OR_EXCESSIVE_INPUT", path: "submission" }],
      warnings,
      missing,
    };
  }
  if (!parsed.success)
    return {
      valid: false,
      errors: parsed.error.issues
        .slice(0, 30)
        .map(() => ({ code: "INVALID_STRUCTURE", path: "submission" })),
      warnings,
      missing,
    };
  const data = parsed.data,
    source = data.candidate,
    title = source.title;
  const titleKey = providerIdentityKey(title.identity);
  if (!importIdentitySchema.safeParse(title.identity).success)
    issue("UNSUPPORTED_PRIMARY_PROVIDER", "candidate.title.identity");
  if (data.canonical.type !== title.type)
    issue("TITLE_TYPE_MISMATCH", "canonical.type");
  const titleKeys = new Set(
    title.mappings.map((value) => providerIdentityKey(value.identity)),
  );
  if (data.gameSupplement) {
    const identity = providerIdentityKey(data.gameSupplement.identity);
    const confirmed = new Set([
      ...titleKeys,
      ...("game" in source &&
      source.game.confirmedSteamIdentities.state === "known"
        ? source.game.confirmedSteamIdentities.value.map(providerIdentityKey)
        : []),
    ]);
    if (
      title.type !== "GAME" ||
      data.gameSupplement.identity.provider !== "STEAM" ||
      !confirmed.has(identity)
    )
      issue("UNCONFIRMED_GAME_SUPPLEMENT", "gameSupplement");
  }
  // Provider counters may be safe JavaScript integers but still exceed PostgreSQL Int.
  function integer(value: unknown, path: string) {
    if (
      typeof value === "number" &&
      (!Number.isInteger(value) || value < 0 || value > 2_147_483_647)
    )
      issue("INTEGER_OUT_OF_RANGE", path);
  }
  for (const [name, field] of Object.entries<unknown>(title.metadata)) {
    if (
      typeof field === "object" &&
      field !== null &&
      "state" in field &&
      field.state === "known" &&
      "value" in field
    )
      integer(field.value, `candidate.title.metadata.${name}`);
  }
  const people = new Set(
    source.people.map((person) => providerIdentityKey(person.identity)),
  );
  const seasons = values(source.seasons);
  const seasonKeys = new Set(
    seasons.map((season) => providerIdentityKey(season.identity)),
  );
  for (const season of seasons) {
    integer(season.seasonNumber, "candidate.seasons.seasonNumber");
    if (season.episodeCount.state === "known")
      integer(season.episodeCount.value, "candidate.seasons.episodeCount");
  }
  for (const credit of values(source.credits))
    integer(credit.displayOrder, "candidate.credits.displayOrder");
  if ("game" in source && source.game.completionTime.state === "known") {
    const time = source.game.completionTime.value;
    for (const field of [
      time.mainStoryMinutes,
      time.mainPlusExtraMinutes,
      time.completionistMinutes,
    ])
      if (field.state === "known")
        integer(field.value, "candidate.game.completionTime");
  }
  if (
    people.size !== source.people.length ||
    seasonKeys.size !== seasons.length ||
    new Set(seasons.map((value) => value.seasonNumber)).size !== seasons.length
  )
    issue("DUPLICATE_ENTITY_REFERENCE", "candidate");
  for (const credit of values(source.credits))
    if (!people.has(providerIdentityKey(credit.personIdentity)))
      issue("MISSING_PERSON_REFERENCE", "candidate.credits");
  for (const season of seasons)
    if (
      providerIdentityKey(season.seriesIdentity) !== titleKey ||
      title.type !== "SERIES"
    )
      issue("SEASON_OWNER_MISMATCH", "candidate.seasons");
  for (const person of source.people)
    if (
      person.birthday.state === "known" &&
      person.deathday.state === "known" &&
      person.deathday.value < person.birthday.value
    )
      issue("INVALID_LIFE_DATES", "candidate.people");
  if (
    title.type === "SERIES" &&
    title.primaryReleaseDate.state === "known" &&
    title.primaryReleaseDate.value.precision === "DAY" &&
    title.metadata.lastAirDate.state === "known" &&
    title.metadata.lastAirDate.value < title.primaryReleaseDate.value.date
  )
    issue("INVALID_SERIES_DATES", "candidate.title.metadata.lastAirDate");
  const media = [
    ...values(title.media),
    ...source.people.flatMap((person) => values(person.media)),
    ...seasons.flatMap((season) => values(season.media)),
  ];
  const mediaByKey = new Map(
    media.map((image) => [mediaCandidateKey(image), image]),
  );
  for (const person of source.people)
    if (
      values(person.media).some(
        (image) =>
          image.owner.kind !== "PERSON" ||
          providerIdentityKey(image.owner.identity) !==
            providerIdentityKey(person.identity),
      )
    )
      issue("PERSON_MEDIA_OWNER_MISMATCH", "candidate.people.media");
  for (const season of seasons)
    if (
      values(season.media).some(
        (image) =>
          image.owner.kind !== "SEASON" ||
          providerIdentityKey(image.owner.identity) !==
            providerIdentityKey(season.identity),
      )
    )
      issue("SEASON_MEDIA_OWNER_MISMATCH", "candidate.seasons.media");
  function owned(image: MediaCandidate) {
    const key = providerIdentityKey(image.owner.identity);
    return (
      (image.owner.kind === "TITLE"
        ? titleKeys
        : image.owner.kind === "PERSON"
          ? people
          : seasonKeys
      ).has(key) &&
      [key, ...titleKeys].includes(
        providerIdentityKey(image.provenance.identity),
      )
    );
  }
  const selected = new Set<string>(),
    purposes = new Set<string>();
  for (const selection of data.selectedMedia) {
    const image = mediaByKey.get(selection.key);
    if (!image || !owned(image) || !isSupportedMediaSource(image)) {
      issue("INVALID_MEDIA_REFERENCE", "selectedMedia");
      continue;
    }
    const owner = providerIdentityKey(image.owner.identity),
      slot = `${owner}:${selection.purpose}`;
    if (selected.has(selection.key) || purposes.has(slot))
      issue("DUPLICATE_MEDIA_SELECTION", "selectedMedia");
    selected.add(selection.key);
    purposes.add(slot);
    if (
      image.owner.kind === "TITLE" &&
      ["POSTER", "HERO_ART"].includes(selection.purpose)
    ) {
      const evaluated = rankMediaCandidates(
        [image],
        selectionContext(title),
        selection.purpose === "POSTER" ? "POSTER" : "HERO_ART",
      );
      if (evaluated.rejected.length) issue("INELIGIBLE_MEDIA", "selectedMedia");
      if (!evaluated.recommended)
        warnings.push({
          code: "MEDIA_REQUIRES_INSPECTION",
          path: "selectedMedia",
        });
    } else if (image.purpose !== selection.purpose)
      issue("MEDIA_PURPOSE_MISMATCH", "selectedMedia");
  }
  const videos = values(title.videos),
    videoKeys = new Set(videos.map(videoCandidateKey));
  if (videos.length > 500)
    issue("EXCESSIVE_VIDEO_CANDIDATES", "candidate.title.videos");
  const rejectedVideos = new Set(
    videos.length > 500
      ? []
      : rankVideoCandidates(videos, selectionContext(title)).rejected.map(
          (video) => video.key,
        ),
  );
  if (new Set(data.selectedVideos).size !== data.selectedVideos.length)
    issue("DUPLICATE_VIDEO_SELECTION", "selectedVideos");
  for (const key of data.selectedVideos) {
    const video = videos.find((entry) => videoCandidateKey(entry) === key);
    if (
      !videoKeys.has(key) ||
      rejectedVideos.has(key) ||
      !video ||
      !titleKeys.has(providerIdentityKey(video.provenance.identity)) ||
      !(
        (video.platform.toLowerCase() === "youtube" &&
          /^[A-Za-z0-9_-]{11}$/.test(video.externalKey)) ||
        (video.platform.toLowerCase() === "vimeo" &&
          /^[1-9]\d{0,11}$/.test(video.externalKey))
      )
    )
      issue("INVALID_VIDEO_REFERENCE", "selectedVideos");
    else
      warnings.push({
        code: "VIDEO_REQUIRES_EDITORIAL_REVIEW",
        path: "selectedVideos",
      });
  }
  for (const [name, field] of Object.entries({
    overview: title.overview,
    originalTitle: title.originalTitle,
    primaryReleaseDate: title.primaryReleaseDate,
    certifications: title.certifications,
  }))
    if (field.state === "missing") missing.push(`candidate.title.${name}`);
  if (
    title.primaryReleaseDate.state === "known" &&
    title.primaryReleaseDate.value.precision !== "DAY"
  )
    warnings.push({
      code: "PARTIAL_RELEASE_DATE",
      path: "candidate.title.primaryReleaseDate",
    });
  if (!data.selectedMedia.some((value) => value.purpose === "POSTER"))
    warnings.push({ code: "MISSING_POSTER", path: "selectedMedia" });
  if (!data.selectedMedia.some((value) => value.purpose === "HERO_ART"))
    warnings.push({ code: "MISSING_HERO", path: "selectedMedia" });
  if (source.issues.length)
    warnings.push({ code: "PARTIAL_PROVIDER_DATA", path: "candidate.issues" });
  if ("game" in source && source.game.relationships.state === "known")
    for (const relation of source.game.relationships.value)
      if (
        ![
          providerIdentityKey(relation.sourceIdentity),
          providerIdentityKey(relation.targetIdentity),
        ].includes(titleKey)
      )
        issue("UNRELATED_TITLE_RELATION", "candidate.game.relationships");
  return errors.length
    ? { valid: false, errors, warnings, missing }
    : { valid: true, data, errors: [], warnings, missing };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
    .join(",")}}`;
}
export function importRequestHash(
  submission: ValidatedImportSubmission,
): string {
  // Recommendations are suggestions derived from the same candidate, never the accepted selection.
  const { recommendations: _recommendations, ...candidate } =
    submission.candidate;
  return createHash("sha256")
    .update(stableJson({ ...submission, candidate }))
    .digest("hex");
}
