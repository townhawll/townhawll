import { describe, expect, it } from "vitest";

import { known } from "../candidate-fields.js";
import {
  creditCandidateSchema,
  type CreditCandidate,
} from "../catalogue-candidates.js";
import type { Provenance } from "../contracts.js";
import {
  gameRelationshipCandidateSchema,
  type GameRelationshipCandidate,
} from "../game-candidates.js";
import { providerIdentitySchema, type ProviderIdentity } from "../identity.js";
import {
  normalizeCompanyReferences,
  normalizeCreditCandidates,
  normalizeNamedReferences,
  normalizeRelationshipCandidates,
} from "./references.js";

const source: Provenance = {
  identity: { provider: "TMDB", entity: "movie", id: "1" },
  fetchedAt: "2026-10-21T00:00:00.000Z",
  sourceUpdatedAt: null,
  sourceUrl: null,
};
const identity = (
  provider: "TMDB" | "IGDB",
  entity: ProviderIdentity["entity"],
  id = "1",
): ProviderIdentity => providerIdentitySchema.parse({ provider, entity, id });
function credit(input: Partial<CreditCandidate> = {}): CreditCandidate {
  return {
    personIdentity: identity("TMDB", "person"),
    type: "CAST",
    characterName: "Hero",
    job: null,
    department: "Acting",
    displayOrder: null,
    providerCreditId: null,
    episodeCount: null,
    provenance: source,
    ...input,
  };
}

describe("credits and references", () => {
  it("preserves multiple roles and characters for one person and distinct person identities", () => {
    const values = [
      credit(),
      credit({ characterName: "Villain" }),
      credit({
        type: "CREW",
        characterName: null,
        job: "Director",
        department: "Directing",
      }),
      credit({
        type: "CREW",
        characterName: null,
        job: "Writer",
        department: "Writing",
      }),
      credit({ type: "CREATOR", characterName: null }),
      credit({ personIdentity: identity("TMDB", "person", "2") }),
    ];
    expect(normalizeCreditCandidates([...values, values[0]!])).toEqual(values);
    expect(
      values.every((value) => creditCandidateSchema.safeParse(value).success),
    ).toBe(true);
  });
  it("merges only exact semantic credits and retains episode/order evidence", () => {
    const values = [
      credit({ characterName: " Hero ", episodeCount: 2 }),
      credit({ episodeCount: 10, displayOrder: 0 }),
      credit({ episodeCount: 1 }),
    ];
    expect(normalizeCreditCandidates(values)).toEqual([
      credit({ episodeCount: 10, displayOrder: 0 }),
    ]);
    expect(
      normalizeCreditCandidates([credit({ characterName: " ", job: "  " })])[0],
    ).toMatchObject({ characterName: null, job: null });
    expect(
      normalizeCreditCandidates([
        credit({ providerCreditId: "one" }),
        credit({ providerCreditId: "two" }),
      ]),
    ).toHaveLength(2);
  });
  it("normalizes labels without equating names or approving provider taxonomy", () => {
    const references = [
      {
        identity: identity("TMDB", "genre"),
        name: "Science   Fiction",
        provenance: source,
      },
      {
        identity: identity("IGDB", "genre"),
        name: "Science Fiction",
        provenance: source,
      },
      {
        identity: identity("TMDB", "keyword"),
        name: "Science Fiction",
        provenance: source,
      },
      {
        identity: identity("TMDB", "genre", "2"),
        name: "Science Fiction",
        provenance: source,
      },
      {
        identity: identity("TMDB", "genre"),
        name: "Sci-fi",
        provenance: source,
      },
    ];
    const result = normalizeNamedReferences([...references, references[0]!]);
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ ...references[0], name: "Science Fiction" });
    expect(
      result.every(
        (value) =>
          !Object.hasOwn(value, "approved") &&
          !Object.hasOwn(value, "canonicalId"),
      ),
    ).toBe(true);
    const franchises = [
      { identity: identity("IGDB", "collection"), name: "Universe" },
      { identity: identity("IGDB", "franchise"), name: "Universe" },
    ];
    expect(normalizeNamedReferences(franchises)).toEqual(franchises);
  });
  it("retains developer/publisher and company/network distinctions", () => {
    const company = {
      identity: identity("IGDB", "company"),
      name: " Example   Studio ",
      role: "DEVELOPER" as const,
      countryCode: null,
      logoUrl: null,
      provenance: source,
    };
    const result = normalizeCompanyReferences([
      company,
      { ...company, role: "PUBLISHER" },
      company,
      { ...company, identity: identity("TMDB", "network"), role: "NETWORK" },
    ]);
    expect(result.map((value) => value.role)).toEqual([
      "DEVELOPER",
      "PUBLISHER",
      "NETWORK",
    ]);
    expect(result.every((value) => value.name === "Example Studio")).toBe(true);
  });
  it("preserves directed external relationships without creating canonical records", () => {
    const edge: GameRelationshipCandidate = {
      sourceIdentity: identity("IGDB", "game"),
      targetIdentity: identity("IGDB", "game", "2"),
      type: "DLC",
      sourceField: "dlcs",
      relatedName: known("More", source),
      provenance: source,
    };
    const reverse = {
      ...edge,
      sourceIdentity: edge.targetIdentity,
      targetIdentity: edge.sourceIdentity,
    };
    const anotherProvider: GameRelationshipCandidate = {
      ...edge,
      targetIdentity: { provider: "STEAM", entity: "app", id: "1" },
    };
    const result = normalizeRelationshipCandidates([
      edge,
      edge,
      reverse,
      { ...edge, sourceField: "parent_game" },
      anotherProvider,
      { ...edge, targetIdentity: edge.sourceIdentity },
    ]);
    expect(result).toEqual([
      edge,
      reverse,
      { ...edge, sourceField: "parent_game" },
      anotherProvider,
    ]);
    expect(
      result.every(
        (value) => gameRelationshipCandidateSchema.safeParse(value).success,
      ),
    ).toBe(true);
    expect(result.every((value) => !Object.hasOwn(value, "titleId"))).toBe(
      true,
    );
  });
});
