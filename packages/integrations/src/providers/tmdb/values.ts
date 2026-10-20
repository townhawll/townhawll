import { z } from "zod";

import type { CandidateField, Provenance } from "../../contracts.js";
import type { TitleDetailsCandidate } from "../../catalogue-candidates.js";
import type { ProviderIdentity } from "../../identity.js";
import { known, missing } from "../../candidate-fields.js";
export { known, missing, field, mapField } from "../../candidate-fields.js";
export {
  cleanText as clean,
  normalizeLanguageCode as language,
  normalizeCountryCode as country,
} from "../../normalization/text.js";

type TmdbIdentity = Extract<ProviderIdentity, { provider: "TMDB" }>;
export type NormalizationContext = {
  provenance: Provenance;
  issues: TitleDetailsCandidate["issues"];
};
export function tmdbIdentity(
  entity: TmdbIdentity["entity"],
  id: number | string,
): TmdbIdentity {
  return { provider: "TMDB", entity, id: String(id) };
}
export function provenance(
  identity: ProviderIdentity,
  fetchedAt: string,
): Provenance {
  const path = identity.entity === "series" ? "tv" : identity.entity;
  return {
    identity,
    fetchedAt,
    sourceUpdatedAt: null,
    sourceUrl: `https://www.themoviedb.org/${path}/${identity.id}`,
  };
}
export function imageUrl(path: string | null | undefined): string | null {
  return path ? `https://image.tmdb.org/t/p/original${path}` : null;
}
export function section<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  name: string,
  context: NormalizationContext,
): CandidateField<T> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    context.issues.push({
      section: name,
      code:
        payload === undefined || payload === null
          ? "MISSING_SECTION"
          : "INVALID_RESPONSE",
      identity: context.provenance.identity,
    });
    return missing("UNAVAILABLE");
  }
  return known(result.data, context.provenance);
}
