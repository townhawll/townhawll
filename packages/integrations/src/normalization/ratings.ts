import { z } from "zod";

import { known, missing } from "../candidate-fields.js";
import {
  ageRatingSelectionSchema,
  certificationSchema,
  type CandidateField,
} from "../contracts.js";
import { providerIdentityKey } from "../identity.js";
import { cleanText, normalizeCountryCode } from "./text.js";

type Certification = z.infer<typeof certificationSchema>;
type Selection = z.infer<typeof ageRatingSelectionSchema>;
type Bucket = Selection["normalizedAgeRating"];
type Kind = "MOVIE" | "SERIES" | "GAME";
const market = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/)
  .transform((value) =>
    value.toUpperCase() === "UK" ? "GB" : value.toUpperCase(),
  )
  .refine((value) => !["XX", "ZZ", "EU"].includes(value));
export const normalizationPolicySchema = z.strictObject({
  preferredMarket: market.nullable().optional(),
  fallbackMarkets: z.array(market).max(20).optional(),
});
export type NormalizationPolicy = z.input<typeof normalizationPolicySchema>;
export function validateNormalizationPolicy(
  value: unknown = {},
): NormalizationPolicy {
  const result = normalizationPolicySchema.safeParse(value);
  if (!result.success)
    throw new Error("Invalid catalogue normalization policy.");
  return result.data;
}

const systems = new Map([
  ["MPA", "MPA"],
  ["MPAA", "MPA"],
  ["MOTIONPICTUREASSOCIATION", "MPA"],
  ["CBFC", "CBFC"],
  ["CENTRALBOARDOFFILMCERTIFICATION", "CBFC"],
  ["USTV", "US_TV"],
  ["TVPARENTALGUIDELINES", "US_TV"],
  ["BBFC", "BBFC"],
  ["ESRB", "ESRB"],
  ["PEGI", "PEGI"],
  ["CERO", "CERO"],
  ["USK", "USK"],
  ["GRAC", "GRAC"],
  ["CLASSIND", "CLASS_IND"],
  ["ACB", "ACB"],
  ["FSK", "FSK"],
]);
const gameBoards = new Set([
  "ESRB",
  "PEGI",
  "CERO",
  "USK",
  "GRAC",
  "CLASS_IND",
  "ACB",
]);
const screenBoards = new Set(["MPA", "CBFC", "US_TV", "BBFC", "ACB", "FSK"]);
const authority = (value: string) =>
  systems.get(value.toUpperCase().replace(/[\s_.-]+/g, "")) ?? null;

/** Explicit labels only. No extracting arbitrary digits or interpreting one board's letters as another's. */
const buckets: ReadonlyMap<string, ReadonlyMap<string, Bucket>> = new Map([
  [
    "MPA",
    new Map<string, Bucket>([
      ["G", "All ages"],
      ["PG", "7+"],
      ["PG13", "13+"],
      ["R", "18+"],
      ["NC17", "18+"],
    ]),
  ],
  [
    "CBFC",
    new Map<string, Bucket>([
      ["U", "All ages"],
      ["UA7+", "7+"],
      ["UA13+", "13+"],
      ["UA16+", "16+"],
      ["A", "18+"],
    ]),
  ],
  [
    "US_TV",
    new Map<string, Bucket>([
      ["TVY", "All ages"],
      ["TVY7", "7+"],
      ["TVY7FV", "7+"],
      ["TVG", "All ages"],
      ["TVPG", "7+"],
      ["TV14", "16+"],
      ["TVMA", "18+"],
    ]),
  ],
  [
    "BBFC",
    new Map<string, Bucket>([
      ["U", "All ages"],
      ["PG", "7+"],
      ["12", "13+"],
      ["12A", "13+"],
      ["15", "16+"],
      ["18", "18+"],
      ["R18", "18+"],
    ]),
  ],
  [
    "ESRB",
    new Map<string, Bucket>([
      ["EC", "All ages"],
      ["EARLYCHILDHOOD", "All ages"],
      ["E", "All ages"],
      ["EVERYONE", "All ages"],
      ["E10", "13+"],
      ["E10+", "13+"],
      ["EVERYONE10+", "13+"],
      ["T", "13+"],
      ["TEEN", "13+"],
      ["M", "18+"],
      ["MATURE17+", "18+"],
      ["AO", "18+"],
      ["ADULTSONLY18+", "18+"],
    ]),
  ],
  [
    "PEGI",
    new Map<string, Bucket>([
      ["3", "All ages"],
      ["7", "7+"],
      ["12", "13+"],
      ["16", "16+"],
      ["18", "18+"],
    ]),
  ],
  [
    "CERO",
    new Map<string, Bucket>([
      ["A", "All ages"],
      ["B", "13+"],
      ["C", "16+"],
      ["D", "18+"],
      ["Z", "18+"],
    ]),
  ],
  [
    "USK",
    new Map<string, Bucket>([
      ["0", "All ages"],
      ["6", "7+"],
      ["12", "13+"],
      ["16", "16+"],
      ["18", "18+"],
    ]),
  ],
  [
    "GRAC",
    new Map<string, Bucket>([
      ["ALL", "All ages"],
      ["12", "13+"],
      ["15", "16+"],
      ["18", "18+"],
    ]),
  ],
  [
    "CLASS_IND",
    new Map<string, Bucket>([
      ["L", "All ages"],
      ["10", "13+"],
      ["12", "13+"],
      ["14", "16+"],
      ["16", "16+"],
      ["18", "18+"],
    ]),
  ],
  [
    "ACB",
    new Map<string, Bucket>([
      ["G", "All ages"],
      ["PG", "7+"],
      ["M", "16+"],
      ["MA15+", "16+"],
      ["MA15", "16+"],
      ["R18+", "18+"],
      ["R18", "18+"],
      ["X18+", "18+"],
    ]),
  ],
  [
    "FSK",
    new Map<string, Bucket>([
      ["0", "All ages"],
      ["6", "7+"],
      ["12", "13+"],
      ["16", "16+"],
      ["18", "18+"],
    ]),
  ],
]);
function label(value: string, system: string): string {
  const cleaned = value
    .trim()
    .toUpperCase()
    .replace(/[\s_.-]+/g, "");
  return system === "CBFC" ? cleaned.replace(/^U\/A/, "UA") : cleaned;
}
export function normalizeCertification(
  certification: Certification,
  kind: Kind,
): { system: string; bucket: Bucket; systemInferred: boolean } | null {
  const providedSystem = cleanText(certification.system);
  let system = providedSystem ? authority(providedSystem) : null;
  if (providedSystem && !system) return null;
  if (!providedSystem) {
    const country = normalizeCountryCode(certification.country);
    // Region/domain establishes a narrowly supported context; raw system is never overwritten.
    if (kind === "MOVIE")
      system =
        new Map([
          ["US", "MPA"],
          ["IN", "CBFC"],
          ["GB", "BBFC"],
          ["AU", "ACB"],
          ["DE", "FSK"],
        ]).get(country ?? "") ?? null;
    else if (kind === "SERIES" && country === "US") system = "US_TV";
  }
  if (!system || !(kind === "GAME" ? gameBoards : screenBoards).has(system))
    return null;
  const bucket = buckets
    .get(system)
    ?.get(label(certification.certification, system));
  return bucket ? { system, bucket, systemInferred: !providedSystem } : null;
}
const severity = new Map<Bucket, number>([
  ["All ages", 0],
  ["7+", 1],
  ["13+", 2],
  ["16+", 3],
  ["18+", 4],
]);
const pegiMarkets = new Set(
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LT LU MT NL NO PL PT RO SK SI ES SE CH GB".split(
    " ",
  ),
);
function marketRank(
  original: Certification,
  system: string,
  market: string,
): number | null {
  const country = normalizeCountryCode(original.country);
  if (country) return country === market ? 0 : null;
  const associations = new Map([
    ["ESRB", ["US", "CA"]],
    ["CERO", ["JP"]],
    ["USK", ["DE"]],
    ["GRAC", ["KR"]],
    ["CLASS_IND", ["BR"]],
    ["ACB", ["AU"]],
  ]);
  return (system === "PEGI" && pegiMarkets.has(market)) ||
    associations.get(system)?.includes(market)
    ? 1
    : null;
}
export function selectAgeRating(
  certifications: CandidateField<Certification[]>,
  kind: Kind,
  policy: NormalizationPolicy = {},
): CandidateField<Selection> {
  const options = validateNormalizationPolicy(policy);
  if (certifications.state === "missing") return certifications;
  const candidates = certifications.value.flatMap((original) => {
    const normalized = normalizeCertification(original, kind);
    return normalized ? [{ original, ...normalized }] : [];
  });
  if (!candidates.length)
    return missing(
      certifications.value.length ? "UNSUPPORTED" : "NOT_PROVIDED",
    );
  let eligible = candidates;
  let selectionEvidence =
    "Used the supported-certification fallback; no matching configured market.";
  const markets = [
    ...new Set([
      ...(options.preferredMarket ? [options.preferredMarket] : []),
      ...(options.fallbackMarkets ?? []),
    ]),
  ];
  for (const market of markets) {
    const matches = candidates.flatMap((candidate) => {
      const rank = marketRank(candidate.original, candidate.system, market);
      return rank === null ? [] : [{ candidate, rank }];
    });
    if (!matches.length) continue;
    const rank = Math.min(...matches.map((value) => value.rank));
    eligible = matches
      .filter((value) => value.rank === rank)
      .map((value) => value.candidate);
    selectionEvidence = `Used configured market ${market}${rank === 1 ? " through its rating authority; country remains provider-supplied" : ""}.`;
    break;
  }
  function stableKey(value: (typeof candidates)[number]): string {
    const original = value.original;
    return JSON.stringify([
      original.country,
      value.system,
      original.certification,
      providerIdentityKey(original.provenance.identity),
      original.sourceReleaseDate,
      original.releaseType,
      original.note,
      original.languageCode,
      original.provenance.fetchedAt,
      original.provenance.sourceUpdatedAt,
      original.provenance.sourceUrl,
    ]);
  }
  const selected = [...eligible].sort((a, b) => {
    const order = (severity.get(b.bucket) ?? 0) - (severity.get(a.bucket) ?? 0);
    if (order) return order;
    const left = stableKey(a),
      right = stableKey(b);
    return left < right ? -1 : left > right ? 1 : 0;
  })[0];
  if (!selected) return missing("UNSUPPORTED");
  return {
    ...known(
      {
        normalizedAgeRating: selected.bucket,
        effectiveCertification: selected.original.certification.trim(),
        effectiveCertificationSystem: selected.system,
        effectiveCertificationCountry: selected.original.country,
      },
      selected.original.provenance,
    ),
    certainty: "INFERRED",
    evidence: [
      selectionEvidence,
      `Mapped ${selected.system} classification to TownHawll's display bucket; the highest bucket wins conflicts within the chosen market.`,
      ...(selected.systemInferred
        ? [
            "Rating authority inferred from the title type and provider region; raw system remains unchanged.",
          ]
        : []),
    ],
  };
}
