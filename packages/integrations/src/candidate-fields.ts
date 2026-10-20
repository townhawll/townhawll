import type { CandidateField, Provenance } from "./contracts.js";

export function known<T>(
  value: T,
  source: Provenance,
): Extract<CandidateField<T>, { state: "known" }> {
  return {
    state: "known",
    value,
    certainty: "PROVIDED",
    evidence: [],
    provenance: source,
  };
}
export function missing(
  reason: Extract<
    CandidateField<never>,
    { state: "missing" }
  >["reason"] = "NOT_PROVIDED",
): Extract<CandidateField<never>, { state: "missing" }> {
  return { state: "missing", reason };
}
export function field<T>(
  value: T | null | undefined,
  source: Provenance,
): CandidateField<T> {
  return value === null || value === undefined
    ? missing()
    : known(value, source);
}

export function mapField<T, U>(
  input: CandidateField<T>,
  map: (value: T) => U,
): CandidateField<U> {
  return input.state === "known"
    ? { ...input, value: map(input.value) }
    : input;
}
