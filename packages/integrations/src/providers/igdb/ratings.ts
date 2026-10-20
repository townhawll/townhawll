import type { TitleCandidate, Provenance } from "../../contracts.js";
import type { GameDetailsCandidate } from "../../game-candidates.js";
import type { IgdbGame } from "./schemas.js";
import { normalizeCertification } from "../../normalization/ratings.js";
import { clean, field, known, missing } from "./values.js";

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
  for (const rating of raw.age_ratings) {
    const organization = clean(rating.organization?.name);
    const label = rating.rating_category?.rating;
    const certification =
      label == null
        ? null
        : {
            certification: label,
            system: organization,
            country: null,
            provenance: source,
          };
    const recognized =
      certification !== null &&
      normalizeCertification(certification, "GAME") !== null;
    sourceRatings.push({
      providerRecordId: String(rating.id),
      organization: field(organization, source),
      rating: field(clean(label), source),
      recognized,
      provenance: source,
    });
    if (certification) certifications.push(certification);
  }
  return {
    certifications: known(certifications, source),
    sourceRatings: known(sourceRatings, source),
  };
}
