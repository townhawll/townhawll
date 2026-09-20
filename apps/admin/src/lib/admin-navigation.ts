import type { Permission } from "@townhawll/auth/permissions";
import { LayoutDashboard, type LucideIcon } from "lucide-react";

export type AdminNavigationRequirement =
  | { mode: "all"; permissions: readonly Permission[] }
  | { mode: "any"; permissions: readonly Permission[] };

export interface AdminNavigationItem {
  group: string;
  href: string;
  icon: LucideIcon;
  label: string;
  requirement?: AdminNavigationRequirement;
}

export const ADMIN_NAVIGATION = [
  {
    group: "Workspace",
    href: "/dashboard",
    icon: LayoutDashboard,
    label: "Dashboard",
  },
] as const satisfies readonly AdminNavigationItem[];

export function canAccessAdminNavigationItem(
  item: AdminNavigationItem,
  effectivePermissions: ReadonlySet<Permission>,
): boolean {
  if (!item.requirement) return true;

  const matches = item.requirement.permissions.map((permission) =>
    effectivePermissions.has(permission),
  );
  return item.requirement.mode === "all"
    ? matches.every(Boolean)
    : matches.some(Boolean);
}

export function getVisibleAdminNavigation(
  effectivePermissions: ReadonlySet<Permission>,
  items: readonly AdminNavigationItem[] = ADMIN_NAVIGATION,
): AdminNavigationItem[] {
  return items.filter((item) =>
    canAccessAdminNavigationItem(item, effectivePermissions),
  );
}
