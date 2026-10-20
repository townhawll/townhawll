import { z } from "zod";
import { normalizeName } from "../../normalization/text.js";

import { field, known, missing } from "../../candidate-fields.js";
import type { CandidateField, Provenance } from "../../contracts.js";
import type {
  GameSupplementCandidate,
  GameSystemRequirementCandidate,
  SystemPlatform,
} from "../../game-supplements.js";
import type { SteamAppIdentity } from "../../identity.js";
import { parseSystemRequirement } from "./requirements.js";
import {
  platformsSchema,
  requirementBlockSchema,
  requirementTextSchema,
  type SteamAppDetails,
} from "./schemas.js";

export function normalizeSteamApp(
  raw: SteamAppDetails,
  identity: SteamAppIdentity,
  fetchedAt: string,
  countryCode: string,
): GameSupplementCandidate {
  const source: Provenance = {
    identity,
    fetchedAt,
    sourceUpdatedAt: null,
    sourceUrl: `https://store.steampowered.com/app/${identity.id}?cc=${countryCode}&l=english`,
  };
  const issues: GameSupplementCandidate["issues"] = [];
  function issue(section: string) {
    issues.push({ section, code: "INVALID_RESPONSE", identity });
  }
  const platforms = platformsSchema.safeParse(raw.platforms);
  if (raw.platforms != null && !platforms.success) issue("platformSupport");
  function support(
    platform: SystemPlatform,
    name: "windows" | "mac" | "linux",
  ): GameSupplementCandidate["platformSupport"][number] {
    if (raw.platforms == null) return { platform, supported: missing() };
    if (!platforms.success)
      return { platform, supported: missing("UNAVAILABLE") };
    const value = platforms.data[name];
    if (value == null) return { platform, supported: missing() };
    const boolean = z.boolean().safeParse(value);
    if (!boolean.success) {
      issue(`platformSupport.${platform}`);
      return { platform, supported: missing("UNAVAILABLE") };
    }
    return { platform, supported: known(boolean.data, source) };
  }
  const platformSupport = [
    support("WINDOWS", "windows"),
    support("MACOS", "mac"),
    support("LINUX", "linux"),
  ];
  const rows: GameSystemRequirementCandidate[] = [];
  let invalidRequirements = false;
  function requirements(input: unknown, platform: SystemPlatform) {
    if (input == null) return;
    const block = requirementBlockSchema.safeParse(input);
    if (!block.success) {
      issue(`systemRequirements.${platform}`);
      invalidRequirements = true;
      return;
    }
    if (Array.isArray(block.data)) return;
    for (const [field, tier] of [
      ["minimum", "MINIMUM"],
      ["recommended", "RECOMMENDED"],
    ] as const) {
      const value = block.data[field];
      if (value == null) continue;
      const text = requirementTextSchema.safeParse(value);
      if (!text.success) {
        issue(`systemRequirements.${platform}.${tier}`);
        invalidRequirements = true;
        continue;
      }
      const parsed = parseSystemRequirement(text.data);
      if (parsed)
        rows.push({
          ...parsed,
          platform,
          tier,
          source: "Steam Store",
          provenance: source,
        });
    }
  }
  requirements(raw.pc_requirements, "WINDOWS");
  requirements(raw.mac_requirements, "MACOS");
  requirements(raw.linux_requirements, "LINUX");
  const systemRequirements: CandidateField<GameSystemRequirementCandidate[]> =
    rows.length
      ? known(rows, source)
      : missing(invalidRequirements ? "UNAVAILABLE" : "NOT_PROVIDED");
  const types = new Map<string, GameSupplementCandidate["appType"]>([
    ["game", "GAME"],
    ["dlc", "DLC"],
    ["demo", "DEMO"],
  ]);
  return {
    identity,
    name: field(raw.name ? normalizeName(raw.name) || null : null, source),
    appType: types.get(raw.type.toLowerCase()) ?? "OTHER",
    sourceAppType: raw.type,
    requestedCountryCode: countryCode,
    requestedLanguageCode: "en",
    platformSupport,
    systemRequirements,
    provenance: source,
    issues,
  };
}
