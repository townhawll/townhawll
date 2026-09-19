import type { StaffRole } from "@townhawll/db";

const BASIC_STAFF_ROLES = new Set<StaffRole>(["CONTENT_EDITOR", "MODERATOR"]);

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
  role: StaffRole,
): boolean {
  const actor = [...new Set(actorRoles)];
  return (
    includesRole(actor, "OWNER") ||
    (includesRole(actor, "ADMIN") && BASIC_STAFF_ROLES.has(role))
  );
}

export function canRemoveRole(
  actorRoles: Iterable<StaffRole>,
  role: StaffRole,
): boolean {
  return canAssignRole(actorRoles, role);
}
