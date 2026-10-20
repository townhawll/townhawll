import type {
  CandidateField,
  Provenance,
  TitleCandidate,
} from "../../contracts.js";
import type { GameDetailsCandidate } from "../../game-candidates.js";
import type { ProviderIdentity } from "../../identity.js";
import { media, videos } from "./media.js";
import { normalizeRatings } from "./ratings.js";
import { gameType, relationships } from "./relations.js";
import {
  primaryReleaseDate,
  releaseEvents,
  releaseStatus,
} from "./releases.js";
import type { IgdbCompletion, IgdbGame, IgdbReference } from "./schemas.js";
import {
  clean,
  field,
  identity,
  key,
  known,
  missing,
  provenance,
} from "./values.js";

type GameTitle = Extract<TitleCandidate, { type: "GAME" }>;
function modes(
  raw: IgdbGame,
  source: Provenance,
): GameTitle["metadata"]["modes"] {
  if (raw.game_modes == null) return missing();
  type Mode = Extract<
    GameTitle["metadata"]["modes"],
    { state: "known" }
  >["value"][number];
  const map: Record<string, Mode> = {
    singleplayer: "SINGLE_PLAYER",
    multiplayer: "MULTIPLAYER",
    cooperative: "CO_OP",
    coop: "CO_OP",
    massivelymultiplayeronline: "MMO",
    "massivelymultiplayeronline(mmo)": "MMO",
    mmo: "MMO",
    splitscreen: "SPLIT_SCREEN",
  };
  const values = raw.game_modes.flatMap((value) => {
    const name = clean("name" in value ? value.name : null);
    const mapped =
      name && Object.hasOwn(map, key(name)) ? map[key(name)] : undefined;
    return mapped ? [mapped] : [];
  });
  return !values.length && raw.game_modes.length
    ? missing("UNSUPPORTED")
    : known([...new Set(values)], source);
}
function aliases(raw: IgdbGame, source: Provenance): GameTitle["aliases"] {
  if (raw.alternative_names == null) return missing();
  const values = raw.alternative_names.flatMap((alias) => {
    const name = clean(alias.name);
    return name
      ? [
          {
            name,
            normalizedKey: name
              .normalize("NFKC")
              .toLowerCase()
              .replace(/\s+/gu, " ")
              .trim(),
            languageCode: null,
            sourceType: clean(alias.comment),
            provenance: source,
          },
        ]
      : [];
  });
  return known(
    [...new Map(values.map((alias) => [alias.normalizedKey, alias])).values()],
    source,
  );
}
function steamIdentities(
  raw: IgdbGame,
): Extract<ProviderIdentity, { provider: "STEAM" }>[] {
  const ids = new Set(
    (raw.external_games ?? []).flatMap((reference) =>
      reference.external_game_source?.name.trim().toLowerCase() === "steam" &&
      reference.uid &&
      /^[1-9]\d{0,9}$/.test(reference.uid) &&
      BigInt(reference.uid) <= 4_294_967_295n
        ? [reference.uid]
        : [],
    ),
  );
  return [...ids].map((id) => ({ provider: "STEAM", entity: "app", id }));
}

export function normalizeGame(
  raw: IgdbGame,
  fetchedAt: string,
): GameDetailsCandidate {
  const source = provenance(
    identity("game", raw.id),
    fetchedAt,
    raw.updated_at,
  );
  const events = releaseEvents(raw, source);
  const primary = primaryReleaseDate(raw, events);
  const status = releaseStatus(raw, primary, source);
  const ratings = normalizeRatings(raw, source);
  const steam = steamIdentities(raw);
  const unresolvedReferences: GameDetailsCandidate["game"]["unresolvedReferences"] =
    [];
  function namedReferences(
    refs: IgdbReference[] | null | undefined,
    entity: "genre" | "keyword" | "theme" | "franchise" | "collection",
    sourceField: string,
  ) {
    return (refs ?? []).flatMap((ref) => {
      const name = clean("name" in ref ? ref.name : null);
      const id = identity(entity, ref.id);
      if (!name) {
        unresolvedReferences.push({ identity: id, sourceField });
        return [];
      }
      return [{ identity: id, name, provenance: source }];
    });
  }
  const genres = namedReferences(raw.genres, "genre", "genres");
  const keywords = namedReferences(raw.keywords, "keyword", "keywords");
  const themes = namedReferences(raw.themes, "theme", "themes");
  const franchises = [
    ...namedReferences(raw.franchises, "franchise", "franchises"),
    ...namedReferences(raw.collections, "collection", "collections"),
  ];
  const companies: Extract<
    GameDetailsCandidate["companies"],
    { state: "known" }
  >["value"] = [];
  for (const involvement of raw.involved_companies ?? []) {
    if (!involvement.company) continue;
    const company = involvement.company;
    const name = clean("name" in company ? company.name : null);
    const id = identity("company", company.id);
    if (!name || (!involvement.developer && !involvement.publisher)) {
      unresolvedReferences.push({
        identity: id,
        sourceField: `involved_companies.${involvement.id}`,
      });
      continue;
    }
    for (const role of [
      involvement.developer ? "DEVELOPER" : null,
      involvement.publisher ? "PUBLISHER" : null,
    ] as const) {
      if (role)
        companies.push({
          identity: id,
          name,
          role,
          countryCode: null,
          logoUrl: null,
          provenance: source,
        });
    }
  }
  const platformRefs = new Map(
    (raw.platforms ?? []).map((platform) => [platform.id, platform]),
  );
  for (const event of raw.release_dates ?? [])
    if (event.platform && !platformRefs.has(event.platform.id))
      platformRefs.set(event.platform.id, event.platform);
  const platforms = [...platformRefs.values()].map((platform) => ({
    identity: identity("platform", platform.id),
    name: field(clean("name" in platform ? platform.name : null), source),
    abbreviation: field(
      clean("abbreviation" in platform ? platform.abbreviation : null),
      source,
    ),
    releases:
      events.state === "known"
        ? events.value.filter(
            (event) => event.platformIdentity?.id === String(platform.id),
          )
        : [],
    provenance: source,
  }));
  const title: GameTitle = {
    type: "GAME",
    identity: source.identity,
    // Conflicting multiple app references remain evidence for review rather than automatic mappings.
    mappings: [
      source,
      ...(steam.length === 1
        ? steam.map((id) => ({
            ...source,
            identity: id,
            sourceUpdatedAt: null,
            sourceUrl: `https://store.steampowered.com/app/${id.id}`,
          }))
        : []),
    ],
    title: raw.name,
    originalTitle: missing("UNSUPPORTED"),
    overview: field(clean(raw.summary), source),
    primaryReleaseDate: primary,
    isAnime: missing("UNSUPPORTED"),
    aliases: aliases(raw, source),
    certifications: ratings.certifications,
    media:
      raw.cover == null && raw.artworks == null && raw.screenshots == null
        ? missing()
        : known(media(raw, source), source),
    videos: videos(raw, source),
    metadata: {
      releaseStatus: status.state === "known" ? status.value : "UNKNOWN",
      gameType: gameType(raw),
      primaryLanguageCode: missing("UNSUPPORTED"),
      modes: modes(raw, source),
    },
  };
  return {
    title,
    genres: raw.genres == null ? missing() : known(genres, source),
    keywords: raw.keywords == null ? missing() : known(keywords, source),
    credits: missing("UNSUPPORTED"),
    people: [],
    companies:
      raw.involved_companies == null
        ? missing()
        : known(
            [
              ...new Map(
                companies.map((company) => [
                  `${company.identity.id}:${company.role}`,
                  company,
                ]),
              ).values(),
            ],
            source,
          ),
    franchises:
      raw.franchises == null && raw.collections == null
        ? missing()
        : known(franchises, source),
    seasons: missing("UNSUPPORTED"),
    watchProviders: missing("UNSUPPORTED"),
    sourceStatus: field(clean(raw.game_status?.status), source),
    sourceSpokenLanguageCodes: missing("UNSUPPORTED"),
    sourceEpisodeRuntimes: missing("UNSUPPORTED"),
    providerPopularity: missing("NOT_REQUESTED"),
    issues: [],
    game: {
      sourceGameType: field(clean(raw.game_type?.type), source),
      sourceStoryline: field(clean(raw.storyline), source),
      firstReleaseTimestamp: field(raw.first_release_date, source),
      releaseStatus: status,
      sourceGameModes:
        raw.game_modes == null
          ? missing()
          : known(
              raw.game_modes.map((mode) => ({
                id: String(mode.id),
                name: clean("name" in mode ? mode.name : null),
              })),
              source,
            ),
      themes: raw.themes == null ? missing() : known(themes, source),
      platforms:
        raw.platforms == null && raw.release_dates == null
          ? missing()
          : known(platforms, source),
      releaseEvents: events,
      relationships: relationships(raw, source),
      sourceRatings: ratings.sourceRatings,
      completionTime: missing("NOT_REQUESTED"),
      confirmedSteamIdentities:
        raw.external_games == null ? missing() : known(steam, source),
      unresolvedReferences,
    },
  };
}

export function normalizeCompletion(
  raw: IgdbCompletion,
  source: Provenance,
): GameDetailsCandidate["game"]["completionTime"] {
  const origin = {
    ...source,
    sourceUpdatedAt: provenance(
      source.identity,
      source.fetchedAt,
      raw.updated_at,
    ).sourceUpdatedAt,
  };
  function seconds(value: number | null | undefined): CandidateField<number> {
    return value ? known(value, origin) : missing();
  }
  function minutes(value: number | null | undefined): CandidateField<number> {
    const result = value == null ? 0 : Math.round(value / 60);
    return result > 0
      ? {
          ...known(result, origin),
          certainty: "INFERRED",
          evidence: [
            "Converted provider seconds to minutes, rounded to the nearest minute.",
          ],
        }
      : missing();
  }
  return known(
    {
      rushedSeconds: seconds(raw.hastily),
      normalSeconds: seconds(raw.normally),
      completionistSeconds: seconds(raw.completely),
      sampleCount: field(raw.count, origin),
      // IGDB defines hastily as credits without extras, normally as finishing with some extras.
      mainStoryMinutes: minutes(raw.hastily),
      mainPlusExtraMinutes: minutes(raw.normally),
      completionistMinutes: minutes(raw.completely),
      provenance: origin,
    },
    origin,
  );
}
