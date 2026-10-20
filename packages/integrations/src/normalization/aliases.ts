import type { z } from "zod";

import { aliasCandidateSchema } from "../contracts.js";
import {
  comparisonKey,
  normalizeCountryCode,
  normalizeLanguageCode,
  normalizeName,
} from "./text.js";

type Alias = z.infer<typeof aliasCandidateSchema>;
type Variant = NonNullable<Alias["sourceVariants"]>[number];
function useful(name: string, sourceType: string | null | undefined): boolean {
  name = name.normalize("NFKC");
  const key = comparisonKey(name);
  if (
    !key ||
    /^(?:n a|na|null|none|unknown|tba|tbc|tbd|untitled|placeholder)$/i.test(key)
  )
    return false;
  if (
    /[\p{Cc}]/u.test(name) ||
    /^(?:https?:\/\/|www\.|[a-z]:[\\/]|\.{1,2}[\\/])/i.test(name)
  )
    return false;
  if (/\.(?:exe|app|bat|cmd|bin|dll|lnk|sh|msi|apk)(?:$|[\s"'\\/])/i.test(name))
    return false;
  if (
    /^[a-f\d]{32,64}$/i.test(name) ||
    /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(name)
  )
    return false;
  return !/\b(?:executable|file\s*name|internal\s*id|package\s*name)\b/i.test(
    sourceType ?? "",
  );
}
function variant(alias: Alias): Variant {
  return {
    name: alias.name,
    languageCode: alias.languageCode,
    countryCode: alias.countryCode ?? null,
    sourceType: alias.sourceType ?? null,
  };
}
export function normalizeAliases(
  aliases: readonly Alias[],
  canonicalNames: readonly string[],
): Alias[] {
  const excluded = new Set(canonicalNames.map(comparisonKey));
  const results = new Map<string, Alias>();
  for (const alias of aliases) {
    const name = normalizeName(alias.name);
    const normalizedKey = comparisonKey(name);
    if (excluded.has(normalizedKey) || !useful(name, alias.sourceType))
      continue;
    const current: Alias = {
      ...alias,
      name,
      normalizedKey,
      languageCode: normalizeLanguageCode(alias.languageCode),
      countryCode: normalizeCountryCode(alias.countryCode),
    };
    const previous = results.get(normalizedKey);
    if (!previous) {
      results.set(normalizedKey, current);
      continue;
    }
    const variants = [
      ...new Map(
        [
          ...(previous.sourceVariants ?? [variant(previous)]),
          ...(current.sourceVariants ?? [variant(current)]),
        ].map((value) => [JSON.stringify(value), value]),
      ).values(),
    ];
    const languages = [
      ...new Set(variants.flatMap((value) => value.languageCode ?? [])),
    ];
    const countries = [
      ...new Set(variants.flatMap((value) => value.countryCode ?? [])),
    ];
    results.set(normalizedKey, {
      ...previous,
      languageCode: languages.length === 1 ? (languages[0] ?? null) : null,
      countryCode: countries.length === 1 ? (countries[0] ?? null) : null,
      ...(variants.length > 1 ? { sourceVariants: variants } : {}),
    });
  }
  return [...results.values()];
}
