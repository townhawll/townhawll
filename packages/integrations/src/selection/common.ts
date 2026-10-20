import type { CandidateField, TitleCandidate } from "../contracts.js";
import { providerIdentityKey, type ProviderIdentity } from "../identity.js";
import type { ScoreFactor } from "./contracts.js";

export type SelectionContext = {
  identity: ProviderIdentity;
  mappings: TitleCandidate["mappings"];
  type: TitleCandidate["type"];
  names: string[];
  originalLanguage: string | null;
  gameType:
    Extract<TitleCandidate, { type: "GAME" }>["metadata"]["gameType"] | null;
};
export const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
export const round = (value: number) => Math.round(value * 100) / 100;
export const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;
export function factor(
  name: string,
  points: number,
  explanation: string,
): ScoreFactor {
  return { name, points: round(points), explanation };
}
export function languagePreference(
  language: string | null,
  preferences: readonly string[],
): number {
  if (!language) return -1;
  const exact = preferences.indexOf(language);
  return exact >= 0
    ? exact
    : preferences.findIndex(
        (value) => value.split("-")[0] === language.split("-")[0],
      );
}
export function belongsToTitle(
  identity: ProviderIdentity,
  context: SelectionContext,
): boolean {
  const key = providerIdentityKey(identity);
  return (
    key === providerIdentityKey(context.identity) ||
    context.mappings.some(
      (mapping) => providerIdentityKey(mapping.identity) === key,
    )
  );
}
export function sourceState<T>(field: CandidateField<T>) {
  return field.state === "known" ? ("KNOWN" as const) : field.reason;
}
export function finishSelection<
  T extends {
    key: string;
    state: "REJECTED" | "ELIGIBLE" | "RECOMMENDED";
    score: number | null;
    recommendable: boolean;
    recommendationReason: string | null;
  },
>(values: T[]) {
  const ordered = [...values].sort(
    (a, b) =>
      (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
      compareText(a.key, b.key),
  );
  const best = ordered.find(
    (value) => value.state !== "REJECTED" && value.recommendable,
  );
  return {
    recommended: best
      ? {
          ...best,
          state: "RECOMMENDED" as const,
          recommendationReason: `Highest-ranked candidate meeting the recommendation policy (score ${best.score}). Review the scoring factors and warnings before editorial selection.`,
        }
      : null,
    alternatives: ordered.filter(
      (value) => value.state !== "REJECTED" && value !== best,
    ),
    rejected: ordered.filter((value) => value.state === "REJECTED"),
  };
}
