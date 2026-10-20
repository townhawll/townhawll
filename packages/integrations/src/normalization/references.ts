import type {
  CreditCandidate,
  TitleDetailsCandidate,
} from "../catalogue-candidates.js";
import type { GameRelationshipCandidate } from "../game-candidates.js";
import { providerIdentityKey, type ProviderIdentity } from "../identity.js";
import { cleanText, normalizeName } from "./text.js";

/** Exact scoped identities plus semantic context; names never establish entity identity. */
export function normalizeNamedReferences<
  T extends { identity: ProviderIdentity; name: string },
>(
  values: readonly T[],
  context: (value: T) => readonly unknown[] = () => [],
): T[] {
  const result = new Map<string, T>();
  for (const value of values) {
    const name = normalizeName(value.name);
    const key = JSON.stringify([
      providerIdentityKey(value.identity),
      name,
      ...context(value),
    ]);
    if (name && !result.has(key)) result.set(key, { ...value, name });
  }
  return [...result.values()];
}
export function normalizeCompanyReferences(
  values: Extract<
    TitleDetailsCandidate["companies"],
    { state: "known" }
  >["value"],
) {
  return normalizeNamedReferences(values, (value) => [
    value.role,
    value.countryCode,
    value.logoUrl,
  ]);
}
export function normalizeCreditCandidates(
  values: readonly CreditCandidate[],
): CreditCandidate[] {
  const result = new Map<string, CreditCandidate>();
  for (const value of values) {
    const credit = {
      ...value,
      characterName: cleanText(normalizeName(value.characterName ?? "")),
      job: cleanText(normalizeName(value.job ?? "")),
      department: cleanText(normalizeName(value.department ?? "")),
    };
    const key = JSON.stringify([
      providerIdentityKey(credit.personIdentity),
      credit.type,
      credit.characterName,
      credit.job,
      credit.department,
      credit.providerCreditId,
    ]);
    const previous = result.get(key);
    if (!previous) result.set(key, credit);
    else
      result.set(key, {
        ...previous,
        displayOrder: previous.displayOrder ?? credit.displayOrder,
        episodeCount:
          previous.episodeCount === null
            ? credit.episodeCount
            : credit.episodeCount === null
              ? previous.episodeCount
              : Math.max(previous.episodeCount, credit.episodeCount),
      });
  }
  return [...result.values()];
}
export function normalizeRelationshipCandidates(
  values: readonly GameRelationshipCandidate[],
): GameRelationshipCandidate[] {
  const result = new Map<string, GameRelationshipCandidate>();
  for (const value of values) {
    const source = providerIdentityKey(value.sourceIdentity),
      target = providerIdentityKey(value.targetIdentity);
    if (source === target) continue;
    const key = JSON.stringify([source, target, value.type, value.sourceField]);
    if (!result.has(key)) result.set(key, value);
  }
  return [...result.values()];
}
