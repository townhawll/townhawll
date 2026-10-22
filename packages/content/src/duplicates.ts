import { comparisonKey } from "@townhawll/integrations/normalization";
import type { DuplicateCheckResult, DuplicateMatch } from "./contracts.ts";
import type { ValidatedImportSubmission } from "./validation.ts";

export interface DuplicateTitleRow {
  id: string;
  title: string;
  originalTitle: string | null;
  type: "MOVIE" | "SERIES" | "GAME";
  primaryReleaseDate: Date | null;
  deletedAt: Date | null;
  aliases: { name: string; normalizedKey: string }[];
}
export function importNames(input: ValidatedImportSubmission): string[] {
  const source = input.candidate.title;
  return [
    ...new Set(
      [
        input.canonical.title,
        source.title,
        ...(source.originalTitle.state === "known"
          ? [source.originalTitle.value]
          : []),
        ...(source.aliases.state === "known"
          ? source.aliases.value.map((alias) => alias.name)
          : []),
      ]
        .map(comparisonKey)
        .filter(Boolean),
    ),
  ];
}
export function possibleDuplicateMatches(
  input: ValidatedImportSubmission,
  rows: readonly DuplicateTitleRow[],
): DuplicateMatch[] {
  const names = new Set(importNames(input));
  const release = input.candidate.title.primaryReleaseDate;
  const date = release.state === "known" ? release.value : null;
  const sourceDay = date?.precision === "DAY" ? date.date : null;
  const year = date
    ? date.precision === "DAY"
      ? Number(date.date.slice(0, 4))
      : date.year
    : null;
  return rows
    .flatMap((row): DuplicateMatch[] => {
      if (row.type !== input.canonical.type) return [];
      const storedYear = row.primaryReleaseDate?.getUTCFullYear() ?? null;
      // Remakes with demonstrably different release years are not name-only duplicates.
      if (year !== null && storedYear !== null && year !== storedYear)
        return [];
      const titleKey = [row.title, row.originalTitle ?? ""]
        .map(comparisonKey)
        .find((name) => name && names.has(name));
      const alias = row.aliases.find((alias) =>
        names.has(comparisonKey(alias.name)),
      );
      if (!titleKey && !alias) return [];
      const evidence: DuplicateMatch["evidence"] = [
        titleKey
          ? { kind: "TITLE_NAME", value: titleKey }
          : { kind: "ALIAS", value: comparisonKey(alias?.name ?? "") },
      ];
      if (year !== null && storedYear === year)
        evidence.push({ kind: "RELEASE_YEAR", value: String(year) });
      if (
        sourceDay &&
        row.primaryReleaseDate?.toISOString().slice(0, 10) === sourceDay
      )
        evidence.push({ kind: "RELEASE_DAY", value: sourceDay });
      return [
        {
          titleId: row.id,
          title: row.title,
          type: row.type,
          deleted: row.deletedAt !== null,
          evidence,
        },
      ];
    })
    .sort((a, b) =>
      a.titleId < b.titleId ? -1 : a.titleId > b.titleId ? 1 : 0,
    );
}
export type { DuplicateCheckResult };
