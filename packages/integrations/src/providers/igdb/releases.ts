import { type CandidateField, type Provenance } from "../../contracts.js";
import type { GameReleaseCandidate } from "../../game-candidates.js";
import type { IgdbGame, IgdbRelease } from "./schemas.js";
import {
  inferGameReleaseStatus,
  mapProvidedStatus,
  normalizeReleaseDate,
  releaseDateField,
} from "../../normalization/dates.js";
import { clean, identity, known, missing, timestamp } from "./values.js";

type ReleaseDate = Extract<
  GameReleaseCandidate["date"],
  { state: "known" }
>["value"];
type ReleaseStatus = Extract<
  import("../../contracts.js").TitleCandidate,
  { type: "GAME" }
>["metadata"]["releaseStatus"];
export function releaseDate(
  raw: IgdbRelease,
  source: Provenance,
): CandidateField<ReleaseDate> {
  const format = clean(raw.date_format?.format)
    ?.toUpperCase()
    .replace(/[-_/\s]/g, "");
  const iso = timestamp(raw.date);
  const year = raw.y ?? (iso ? Number(iso.slice(0, 4)) : null);
  if (iso && raw.y && raw.y !== Number(iso.slice(0, 4)))
    return missing("UNAVAILABLE");
  if (!year || !format || format === "TBD")
    return missing(format === "TBD" ? "NOT_PROVIDED" : "UNSUPPORTED");
  if (format === "YYYY")
    return releaseDateField({ precision: "YEAR", year }, source);
  const quarter = /^YYYYQ([1-4])$/.exec(format)?.[1];
  if (quarter)
    return releaseDateField(
      { precision: "QUARTER", year, quarter: Number(quarter) },
      source,
    );
  const month = raw.m || (iso ? Number(iso.slice(5, 7)) : null);
  if (["YYYYMMMM", "YYYYMM"].includes(format) && month) {
    if (iso && raw.m && raw.m !== Number(iso.slice(5, 7)))
      return missing("UNAVAILABLE");
    return releaseDateField({ precision: "MONTH", year, month }, source);
  }
  if (["YYYYMMMMDD", "YYYYMMDD"].includes(format)) {
    const day = raw.d || (iso ? Number(iso.slice(8, 10)) : null);
    if (!month || !day) return missing();
    const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (iso && date !== iso.slice(0, 10)) return missing("UNAVAILABLE");
    if (normalizeReleaseDate(date)) return releaseDateField(date, source);
  }
  return missing("UNSUPPORTED");
}
export function releaseEvents(
  raw: IgdbGame,
  source: Provenance,
): CandidateField<GameReleaseCandidate[]> {
  return raw.release_dates == null
    ? missing()
    : known(
        raw.release_dates.map((event) => ({
          providerRecordId: String(event.id),
          platformIdentity: event.platform
            ? identity("platform", event.platform.id)
            : null,
          date: releaseDate(event, source),
          sourceTimestamp: event.date ?? null,
          sourceDateFormat: clean(event.date_format?.format),
          sourceComponents: {
            year: event.y ?? null,
            month: event.m ?? null,
            day: event.d ?? null,
          },
          sourceLabel: clean(event.human),
          region: clean(event.release_region?.region),
          status: clean(event.status?.name),
          provenance: source,
        })),
        source,
      );
}
export function primaryReleaseDate(
  raw: IgdbGame,
  events: CandidateField<GameReleaseCandidate[]>,
): CandidateField<ReleaseDate> {
  if (raw.first_release_date == null) return missing();
  if (events.state !== "known") return missing("UNSUPPORTED");
  const matches = events.value.filter(
    (event) => event.sourceTimestamp === raw.first_release_date,
  );
  if (
    !matches.length ||
    matches.some((event) => event.date.state === "missing")
  )
    return missing("UNSUPPORTED");
  const dates = matches.flatMap((event) =>
    event.date.state === "known" ? [event.date] : [],
  );
  const precision = { YEAR: 0, QUARTER: 1, MONTH: 2, DAY: 3 };
  return (
    dates.sort(
      (a, b) => precision[a.value.precision] - precision[b.value.precision],
    )[0] ?? missing()
  );
}
export function releaseStatus(
  raw: IgdbGame,
  date: CandidateField<ReleaseDate>,
  source: Provenance,
): CandidateField<ReleaseStatus> {
  const statuses = new Map<string, ReleaseStatus>([
    ["released", "RELEASED"],
    ["upcoming", "UPCOMING"],
    ["delayed", "DELAYED"],
    ["cancelled", "CANCELLED"],
    ["canceled", "CANCELLED"],
    ["earlyaccess", "EARLY_ACCESS"],
  ]);
  return inferGameReleaseStatus(
    mapProvidedStatus(raw.game_status?.status, statuses, "UNKNOWN", source),
    date,
    source,
  );
}
