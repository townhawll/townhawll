import type { Provenance } from "../../contracts.js";
import type { ProviderIdentity } from "../../identity.js";

export { known, missing, field } from "../../candidate-fields.js";
type IgdbIdentity = Extract<ProviderIdentity, { provider: "IGDB" }>;
export function identity(
  entity: IgdbIdentity["entity"],
  id: number,
): IgdbIdentity {
  return { provider: "IGDB", entity, id: String(id) };
}
export function clean(value: string | null | undefined): string | null {
  return value?.trim() || null;
}
export function key(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}
export function timestamp(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value * 1000);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() <= 9999
    ? date.toISOString()
    : null;
}
export function provenance(
  id: ProviderIdentity,
  fetchedAt: string,
  updatedAt?: number | null,
): Provenance {
  return {
    identity: id,
    fetchedAt,
    sourceUpdatedAt: timestamp(updatedAt),
    sourceUrl:
      id.provider === "STEAM"
        ? `https://store.steampowered.com/app/${id.id}`
        : null,
  };
}
