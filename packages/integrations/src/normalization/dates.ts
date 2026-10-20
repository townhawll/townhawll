import type { z } from "zod";

import { known, missing } from "../candidate-fields.js";
import {
  releaseDateSchema,
  type CandidateField,
  type Provenance,
  type TitleCandidate,
} from "../contracts.js";
import { cleanText, compactToken } from "./text.js";

export type ReleaseDate = z.infer<typeof releaseDateSchema>;
type GameStatus = Extract<
  TitleCandidate,
  { type: "GAME" }
>["metadata"]["releaseStatus"];
export function normalizeReleaseDate(input: unknown): ReleaseDate | null {
  let value = input;
  if (typeof input === "string") {
    const text = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text))
      value = { precision: "DAY", date: text };
    else if (/^\d{4}-\d{2}$/.test(text))
      value = {
        precision: "MONTH",
        year: Number(text.slice(0, 4)),
        month: Number(text.slice(5)),
      };
    else if (/^\d{4}$/.test(text))
      value = { precision: "YEAR", year: Number(text) };
    else if (/^\d{4}-Q[1-4]$/i.test(text))
      value = {
        precision: "QUARTER",
        year: Number(text.slice(0, 4)),
        quarter: Number(text.slice(-1)),
      };
  }
  const result = releaseDateSchema.safeParse(value);
  return result.success ? result.data : null;
}
export function releaseDateField(
  input: unknown,
  source: Provenance,
): CandidateField<ReleaseDate> {
  if (input == null || input === "") return missing();
  const date = normalizeReleaseDate(input);
  return date ? known(date, source) : missing("UNSUPPORTED");
}
export function exactCalendarDate(
  value: string | null | undefined,
): string | null {
  const date = normalizeReleaseDate(value);
  return date?.precision === "DAY" ? date.date : null;
}
export function mapProvidedStatus<T extends string>(
  raw: string | null | undefined,
  values: ReadonlyMap<string, T>,
  unknown: T,
  source: Provenance,
): CandidateField<T> {
  const status = cleanText(raw);
  return status
    ? known(values.get(compactToken(status)) ?? unknown, source)
    : missing();
}
export function inferGameReleaseStatus(
  explicit: CandidateField<GameStatus>,
  date: CandidateField<ReleaseDate>,
  source: Provenance,
): CandidateField<GameStatus> {
  if (explicit.state === "known" || explicit.reason !== "NOT_PROVIDED")
    return explicit;
  if (date.state !== "known" || date.value.precision !== "DAY")
    return missing();
  const instant = new Date(source.fetchedAt);
  if (!Number.isFinite(instant.getTime())) return missing("UNAVAILABLE");
  return {
    ...known<GameStatus>(
      date.value.date <= instant.toISOString().slice(0, 10)
        ? "RELEASED"
        : "UPCOMING",
      source,
    ),
    certainty: "INFERRED",
    evidence: [
      "No explicit game status; compared the precision-verified first release day with the UTC fetch date.",
    ],
  };
}
