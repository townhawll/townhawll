import type { StaffRole } from "@townhawll/db";
import { z } from "zod";

export const PERMISSION = {
  CONTENT_READ: "content.read",
  CONTENT_CREATE: "content.create",
  CONTENT_UPDATE: "content.update",
  CONTENT_PUBLISH: "content.publish",
  CONTENT_DELETE: "content.delete",
  CONTENT_OVERRIDE: "content.override",
  EDITORIAL_MANAGE: "editorial.manage",
  MODERATION_READ: "moderation.read",
  MODERATION_ACTION: "moderation.action",
  MODERATION_RESTRICT_USER: "moderation.restrictUser",
  MODERATION_BAN_USER: "moderation.banUser",
  MODERATION_APPEAL: "moderation.appeal",
  USERS_READ: "users.read",
  USERS_UPDATE: "users.update",
  USERS_ADJUST_XP: "users.adjustXp",
  AWARDS_READ: "awards.read",
  AWARDS_MANAGE: "awards.manage",
  AWARDS_FINALIZE: "awards.finalize",
  AI_READ: "ai.read",
  AI_VERIFY: "ai.verify",
  AI_OVERRIDE: "ai.override",
  AI_MANAGE: "ai.manage",
  OPERATIONS_READ: "operations.read",
  OPERATIONS_RETRY_JOB: "operations.retryJob",
  OPERATIONS_CANCEL_JOB: "operations.cancelJob",
  OPERATIONS_MANAGE_INTEGRATIONS: "operations.manageIntegrations",
  SYSTEM_READ: "system.read",
  SYSTEM_MANAGE_KILL_SWITCHES: "system.manageKillSwitches",
  SYSTEM_EMERGENCY_LOCKDOWN: "system.emergencyLockdown",
  STAFF_READ: "staff.read",
  STAFF_INVITE: "staff.invite",
  STAFF_UPDATE: "staff.update",
  STAFF_MANAGE_BASIC_ROLES: "staff.manageBasicRoles",
  STAFF_MANAGE_PRIVILEGED_ROLES: "staff.managePrivilegedRoles",
  STAFF_DISABLE: "staff.disable",
  AUDIT_READ: "audit.read",
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

export const ALL_PERMISSIONS = Object.freeze(
  Object.values(PERMISSION),
) as readonly Permission[];

export const ALL_STAFF_ROLES = [
  "CONTENT_EDITOR",
  "MODERATOR",
  "ADMIN",
  "TECHNICAL_ADMIN",
  "OWNER",
] as const satisfies readonly StaffRole[];

type MissingStaffRole = Exclude<StaffRole, (typeof ALL_STAFF_ROLES)[number]>;
const allStaffRolesAreListed: MissingStaffRole extends never ? true : never =
  true;
void allStaffRolesAreListed;

export const staffRoleSchema = z.enum(ALL_STAFF_ROLES);

export function parseStaffRole(value: unknown): StaffRole {
  return staffRoleSchema.parse(value);
}

export const ROLE_PERMISSIONS = {
  CONTENT_EDITOR: [
    PERMISSION.CONTENT_READ,
    PERMISSION.CONTENT_CREATE,
    PERMISSION.CONTENT_UPDATE,
    PERMISSION.CONTENT_PUBLISH,
    PERMISSION.EDITORIAL_MANAGE,
    PERMISSION.AWARDS_READ,
    PERMISSION.AWARDS_MANAGE,
    PERMISSION.AI_READ,
    PERMISSION.AI_VERIFY,
  ],
  MODERATOR: [
    PERMISSION.CONTENT_READ,
    PERMISSION.MODERATION_READ,
    PERMISSION.MODERATION_ACTION,
    PERMISSION.MODERATION_RESTRICT_USER,
    PERMISSION.MODERATION_BAN_USER,
    PERMISSION.MODERATION_APPEAL,
    PERMISSION.USERS_READ,
    PERMISSION.AUDIT_READ,
  ],
  ADMIN: [
    PERMISSION.CONTENT_READ,
    PERMISSION.CONTENT_CREATE,
    PERMISSION.CONTENT_UPDATE,
    PERMISSION.CONTENT_PUBLISH,
    PERMISSION.CONTENT_DELETE,
    PERMISSION.CONTENT_OVERRIDE,
    PERMISSION.EDITORIAL_MANAGE,
    PERMISSION.MODERATION_READ,
    PERMISSION.MODERATION_ACTION,
    PERMISSION.MODERATION_RESTRICT_USER,
    PERMISSION.MODERATION_BAN_USER,
    PERMISSION.MODERATION_APPEAL,
    PERMISSION.USERS_READ,
    PERMISSION.USERS_UPDATE,
    PERMISSION.USERS_ADJUST_XP,
    PERMISSION.AWARDS_READ,
    PERMISSION.AWARDS_MANAGE,
    PERMISSION.AWARDS_FINALIZE,
    PERMISSION.AI_READ,
    PERMISSION.AI_VERIFY,
    PERMISSION.AI_OVERRIDE,
    PERMISSION.AI_MANAGE,
    PERMISSION.OPERATIONS_READ,
    PERMISSION.OPERATIONS_RETRY_JOB,
    PERMISSION.SYSTEM_READ,
    PERMISSION.STAFF_READ,
    PERMISSION.STAFF_INVITE,
    PERMISSION.STAFF_UPDATE,
    PERMISSION.STAFF_MANAGE_BASIC_ROLES,
    PERMISSION.STAFF_DISABLE,
    PERMISSION.AUDIT_READ,
  ],
  TECHNICAL_ADMIN: [
    PERMISSION.CONTENT_READ,
    PERMISSION.AI_READ,
    PERMISSION.AI_MANAGE,
    PERMISSION.OPERATIONS_READ,
    PERMISSION.OPERATIONS_RETRY_JOB,
    PERMISSION.OPERATIONS_CANCEL_JOB,
    PERMISSION.OPERATIONS_MANAGE_INTEGRATIONS,
    PERMISSION.SYSTEM_READ,
    PERMISSION.SYSTEM_MANAGE_KILL_SWITCHES,
    PERMISSION.AUDIT_READ,
  ],
  OWNER: ALL_PERMISSIONS,
} as const satisfies Readonly<Record<StaffRole, readonly Permission[]>>;

export interface StaffAuthorization {
  permissions: ReadonlySet<Permission>;
  roles: readonly StaffRole[];
}

export class StaffRequiredError extends Error {
  override name = "StaffRequiredError";
}

export class PermissionRequiredError extends Error {
  override name = "PermissionRequiredError";
}

export class OwnerRequiredError extends Error {
  override name = "OwnerRequiredError";
}

function uniqueRoles(roles: Iterable<StaffRole>): StaffRole[] {
  return [...new Set(roles)];
}

export function getEffectivePermissions(
  roles: Iterable<StaffRole>,
): ReadonlySet<Permission> {
  const permissions = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      permissions.add(permission);
    }
  }
  return permissions;
}

export function hasPermission(
  roles: Iterable<StaffRole>,
  permission: Permission,
): boolean {
  return getEffectivePermissions(roles).has(permission);
}

export function hasAnyPermission(
  roles: Iterable<StaffRole>,
  permissions: Iterable<Permission>,
): boolean {
  const effectivePermissions = getEffectivePermissions(roles);
  for (const permission of permissions) {
    if (effectivePermissions.has(permission)) return true;
  }
  return false;
}

export function hasAllPermissions(
  roles: Iterable<StaffRole>,
  permissions: Iterable<Permission>,
): boolean {
  const effectivePermissions = getEffectivePermissions(roles);
  for (const permission of permissions) {
    if (!effectivePermissions.has(permission)) return false;
  }
  return true;
}

export function isStaff(roles: Iterable<StaffRole>): boolean {
  for (const _role of roles) return true;
  return false;
}

export function requireStaff(roles: Iterable<StaffRole>): StaffAuthorization {
  const unique = uniqueRoles(roles);
  if (!isStaff(unique)) {
    throw new StaffRequiredError("Staff access is required.");
  }
  return { permissions: getEffectivePermissions(unique), roles: unique };
}

export function requirePermission(
  roles: Iterable<StaffRole>,
  permission: Permission,
): StaffAuthorization {
  const authorization = requireStaff(roles);
  if (!authorization.permissions.has(permission)) {
    throw new PermissionRequiredError("The required permission is missing.");
  }
  return authorization;
}

export function requireAnyPermission(
  roles: Iterable<StaffRole>,
  permissions: Iterable<Permission>,
): StaffAuthorization {
  const authorization = requireStaff(roles);
  for (const permission of permissions) {
    if (authorization.permissions.has(permission)) return authorization;
  }
  throw new PermissionRequiredError("A required permission is missing.");
}

export function requireAllPermissions(
  roles: Iterable<StaffRole>,
  permissions: Iterable<Permission>,
): StaffAuthorization {
  const authorization = requireStaff(roles);
  for (const permission of permissions) {
    if (!authorization.permissions.has(permission)) {
      throw new PermissionRequiredError("A required permission is missing.");
    }
  }
  return authorization;
}

export function requireOwner(roles: Iterable<StaffRole>): StaffAuthorization {
  const authorization = requireStaff(roles);
  if (!authorization.roles.includes("OWNER")) {
    throw new OwnerRequiredError("Owner access is required.");
  }
  return authorization;
}
