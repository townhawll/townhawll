import { z } from "zod";

import type { CandidateField, Provenance } from "../../contracts.js";
import type { TitleDetailsCandidate } from "../../catalogue-candidates.js";
import type { ProviderIdentity } from "../../identity.js";
import { known, missing } from "../../candidate-fields.js";
export { known, missing, field } from "../../candidate-fields.js";

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
export function clean(value: string | null | undefined): string | null {
  return value?.trim() || null;
}
export function language(value: string | null | undefined): string | null {
  const code = clean(value)?.toLowerCase();
  return code &&
    /^[a-z]{2,3}$/.test(code) &&
    !["xx", "zxx", "und"].includes(code)
    ? code
    : null;
}
export function country(value: string | null | undefined): string | null {
  const code = clean(value)?.toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : null;
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
export function mapField<T, U>(
  input: CandidateField<T>,
  map: (value: T) => U,
): CandidateField<U> {
  return input.state === "known"
    ? { ...input, value: map(input.value) }
    : input;
}
