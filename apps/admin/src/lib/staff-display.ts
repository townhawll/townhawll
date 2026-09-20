import type { StaffContext } from "@townhawll/auth/staff-context";

type StaffRole = StaffContext["roles"][number];

const STAFF_ROLE_LABELS = {
  ADMIN: "Admin",
  CONTENT_EDITOR: "Content editor",
  MODERATOR: "Moderator",
  OWNER: "Owner",
  TECHNICAL_ADMIN: "Technical admin",
} as const satisfies Readonly<Record<StaffRole, string>>;

export function getStaffRoleLabel(role: StaffRole): string {
  return STAFF_ROLE_LABELS[role];
}

export function getStaffRoleSummary(roles: readonly StaffRole[]): string {
  return roles.map(getStaffRoleLabel).join(" + ");
}
