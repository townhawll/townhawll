import type { StaffRole } from "@townhawll/db";

const BASIC_STAFF_ROLES = new Set<StaffRole>(["CONTENT_EDITOR", "MODERATOR"]);
const PRIVILEGED_STAFF_ROLES = new Set<StaffRole>([
  "ADMIN",
  "TECHNICAL_ADMIN",
  "OWNER",
]);

function includesRole(roles: Iterable<StaffRole>, expected: StaffRole) {
  for (const role of roles) {
    if (role === expected) return true;
  }
  return false;
}

export function canManageStaff(
  actorRoles: Iterable<StaffRole>,
  targetRoles: Iterable<StaffRole>,
): boolean {
  const actor = [...new Set(actorRoles)];
  if (includesRole(actor, "OWNER")) return true;
  if (!includesRole(actor, "ADMIN")) return false;

  for (const targetRole of targetRoles) {
    if (!BASIC_STAFF_ROLES.has(targetRole)) return false;
  }
  return true;
}

export function canAssignRole(
  actorRoles: Iterable<StaffRole>,
  targetRoles: Iterable<StaffRole>,
  role: StaffRole,
): boolean {
  const actor = [...new Set(actorRoles)];
  if (includesRole(actor, "OWNER")) return true;
  if (!includesRole(actor, "ADMIN") || !BASIC_STAFF_ROLES.has(role)) {
    return false;
  }

  for (const targetRole of targetRoles) {
    if (PRIVILEGED_STAFF_ROLES.has(targetRole)) return false;
  }
  return true;
}

export function canRemoveRole(
  actorRoles: Iterable<StaffRole>,
  targetRoles: Iterable<StaffRole>,
  role: StaffRole,
  options: Readonly<{ currentOwnerCount?: number }> = {},
): boolean {
  const actor = [...new Set(actorRoles)];
  if (includesRole(actor, "OWNER")) {
    if (role !== "OWNER") return true;
    return (options.currentOwnerCount ?? 0) > 1;
  }

  return canAssignRole(actor, targetRoles, role);
}
