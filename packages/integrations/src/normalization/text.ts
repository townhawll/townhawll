export function cleanText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}
/** Preserve letters, numbers and combining marks from every script; no fuzzy matching. */
export function comparisonKey(value: string): string {
  return value
    .replace(/[™®©]/gu, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}
export function compactToken(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_-]+/gu, "");
}

/** Well-formed BCP 47 codes with explicit common ISO/deprecated aliases; never infer from script/country. */
export function normalizeLanguageCode(
  value: string | null | undefined,
): string | null {
  const input = cleanText(value)?.replaceAll("_", "-");
  if (!input || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(input)) return null;
  const pieces = input.split("-");
  const first = pieces[0]?.toLowerCase() ?? "";
  if (["xx", "zz", "und", "zxx", "mul", "mis"].includes(first)) return null;
  const aliases = new Map([
    ["eng", "en"],
    ["jpn", "ja"],
    ["fra", "fr"],
    ["fre", "fr"],
    ["deu", "de"],
    ["ger", "de"],
    ["zho", "zh"],
    ["chi", "zh"],
    ["kor", "ko"],
    ["hin", "hi"],
    ["spa", "es"],
    ["por", "pt"],
    ["ita", "it"],
    ["rus", "ru"],
    ["ara", "ar"],
    ["iw", "he"],
    ["in", "id"],
    ["ji", "yi"],
  ]);
  return [
    aliases.get(first) ?? first,
    ...pieces
      .slice(1)
      .map((part) =>
        part.length === 4
          ? part[0]?.toUpperCase() + part.slice(1).toLowerCase()
          : part.length === 2
            ? part.toUpperCase()
            : part.toLowerCase(),
      ),
  ].join("-");
}
export function normalizeCountryCode(
  value: string | null | undefined,
): string | null {
  const code = cleanText(value)?.toUpperCase();
  if (
    !code ||
    !/^[A-Z]{2}$/.test(code) ||
    ["XX", "ZZ", "ZZZ", "EU"].includes(code)
  )
    return null;
  return code === "UK" ? "GB" : code;
}
export function normalizeCodes(
  values: readonly string[],
  normalize: (value: string) => string | null,
): string[] {
  return [...new Set(values.flatMap((value) => normalize(value) ?? []))];
}
