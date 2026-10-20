import type { Provenance } from "../../contracts.js";
import type { GameRelationshipCandidate } from "../../game-candidates.js";
import type { IgdbGame, IgdbReference } from "./schemas.js";
import { normalizeRelationshipCandidates } from "../../normalization/references.js";
import { clean, field, identity, key, known, missing } from "./values.js";

type GameType = Extract<
  import("../../contracts.js").TitleCandidate,
  { type: "GAME" }
>["metadata"]["gameType"];
export function gameType(raw: IgdbGame): GameType {
  const types: Record<string, GameType> = {
    maingame: "MAIN_GAME",
    dlc: "DLC",
    "dlc/addon": "DLC",
    addon: "DLC",
    expansion: "EXPANSION",
    standaloneexpansion: "STANDALONE_EXPANSION",
    remake: "REMAKE",
    remaster: "REMASTER",
    expandedgame: "EDITION",
    edition: "EDITION",
    bundle: "BUNDLE",
    pack: "BUNDLE",
  };
  return raw.game_type
    ? Object.hasOwn(types, key(raw.game_type.type))
      ? (types[key(raw.game_type.type)] ?? "OTHER")
      : "OTHER"
    : raw.version_parent
      ? "EDITION"
      : "OTHER";
}
export function relationships(raw: IgdbGame, source: Provenance) {
  const result: GameRelationshipCandidate[] = [];
  let present = false;
  function add(
    reference: IgdbReference,
    type: GameRelationshipCandidate["type"],
    sourceField: string,
    child: boolean,
  ) {
    if (reference.id === raw.id) return;
    const related = identity("game", reference.id);
    result.push({
      sourceIdentity: child ? related : source.identity,
      targetIdentity: child ? source.identity : related,
      type,
      sourceField,
      relatedName: field(
        clean("name" in reference ? reference.name : null),
        source,
      ),
      provenance: source,
    });
  }
  const fields = {
    dlcs: "DLC",
    expansions: "EXPANSION",
    standalone_expansions: "STANDALONE_EXPANSION",
    remakes: "REMAKE",
    remasters: "REMASTER",
    expanded_games: "EDITION",
    ports: "RELATED",
    forks: "RELATED",
    bundles: "RELATED",
  } as const;
  for (const [name, type] of Object.entries(fields)) {
    const references = raw[name as keyof typeof fields];
    if (references != null) {
      present = true;
      for (const ref of references) add(ref, type, name, name !== "bundles");
    }
  }
  if (raw.parent_game) {
    present = true;
    const type = gameType(raw);
    add(
      raw.parent_game,
      type === "DLC" ||
        type === "EXPANSION" ||
        type === "STANDALONE_EXPANSION" ||
        type === "REMAKE" ||
        type === "REMASTER"
        ? type
        : "RELATED",
      "parent_game",
      false,
    );
  }
  if (raw.version_parent) {
    present = true;
    add(raw.version_parent, "EDITION", "version_parent", false);
  }
  // Keep distinct source fields as evidence. Never infer sequels from names/similar_games/collection order.
  return present
    ? known(normalizeRelationshipCandidates(result), source)
    : missing();
}
