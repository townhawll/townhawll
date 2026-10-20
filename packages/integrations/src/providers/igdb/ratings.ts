import type { TitleCandidate, Provenance } from "../../contracts.js";
import type { GameDetailsCandidate } from "../../game-candidates.js";
import type { IgdbGame } from "./schemas.js";
import { clean, field, key, known, missing } from "./values.js";

// Authority-specific labels, not the old global numeric rating-category enum.
const ratings: Record<string, { system: string; labels: ReadonlySet<string> }> =
  {
    esrb: {
      system: "ESRB",
      labels: new Set(["RP", "EC", "E", "E10", "E10+", "T", "M", "AO"]),
    },
    pegi: { system: "PEGI", labels: new Set(["3", "7", "12", "16", "18"]) },
    cero: { system: "CERO", labels: new Set(["A", "B", "C", "D", "Z"]) },
    usk: { system: "USK", labels: new Set(["0", "6", "12", "16", "18"]) },
    grac: {
      system: "GRAC",
      labels: new Set(["ALL", "12", "15", "18", "TESTING"]),
    },
    classind: {
      system: "CLASS_IND",
      labels: new Set(["L", "10", "12", "14", "16", "18"]),
    },
    acb: {
      system: "ACB",
      labels: new Set(["G", "PG", "M", "MA15+", "R18+", "RC"]),
    },
  };
export function normalizeRatings(raw: IgdbGame, source: Provenance) {
  if (raw.age_ratings == null)
    return { certifications: missing(), sourceRatings: missing() };
  const certifications: Extract<
    TitleCandidate["certifications"],
    { state: "known" }
  >["value"] = [];
  const sourceRatings: Extract<
    GameDetailsCandidate["game"]["sourceRatings"],
    { state: "known" }
  >["value"] = [];
  let hasUnknown = false;
  for (const rating of raw.age_ratings) {
    const organization = clean(rating.organization?.name);
    const label = clean(rating.rating_category?.rating);
    const authorityKey = key(organization ?? "");
    const authority = Object.hasOwn(ratings, authorityKey)
      ? ratings[authorityKey]
      : undefined;
    const recognized =
      !!authority &&
      !!label &&
      authority.labels.has(label.toUpperCase().replace(/\s/g, ""));
    sourceRatings.push({
      providerRecordId: String(rating.id),
      organization: field(organization, source),
      rating: field(label, source),
      recognized,
      provenance: source,
    });
    if (recognized && authority && label)
      certifications.push({
        certification: label,
        system: authority.system,
        country: null,
        provenance: source,
      });
    else hasUnknown = true;
  }
  return {
    certifications:
      !certifications.length && hasUnknown
        ? missing("UNSUPPORTED")
        : known(certifications, source),
    sourceRatings: known(sourceRatings, source),
  };
}
