import { expect, test } from "vitest";

import type { StaffRole } from "@townhawll/db";

import {
  ALL_PERMISSIONS,
  getEffectivePermissions,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isStaff,
  OwnerRequiredError,
  parseStaffRole,
  PERMISSION,
  PermissionRequiredError,
  requireAllPermissions,
  requireAnyPermission,
  requireOwner,
  requirePermission,
  requireStaff,
  ROLE_PERMISSIONS,
  StaffRequiredError,
} from "./permissions.ts";

function permissionsFor(role: StaffRole) {
  return [...getEffectivePermissions([role])].sort();
}

test("CONTENT_EDITOR has exactly the editorial permission set", () => {
  expect(permissionsFor("CONTENT_EDITOR")).toStrictEqual(
    [...ROLE_PERMISSIONS.CONTENT_EDITOR].sort(),
  );
  expect(hasPermission(["CONTENT_EDITOR"], PERMISSION.CONTENT_PUBLISH)).toBe(
    true,
  );
  expect(hasPermission(["CONTENT_EDITOR"], PERMISSION.CONTENT_DELETE)).toBe(
    false,
  );
});

test("MODERATOR has exactly the moderation permission set", () => {
  expect(permissionsFor("MODERATOR")).toStrictEqual(
    [...ROLE_PERMISSIONS.MODERATOR].sort(),
  );
  expect(hasPermission(["MODERATOR"], PERMISSION.MODERATION_BAN_USER)).toBe(
    true,
  );
  expect(hasPermission(["MODERATOR"], PERMISSION.CONTENT_UPDATE)).toBe(false);
});

test("ADMIN has broad product operations without privileged staff control", () => {
  expect(permissionsFor("ADMIN")).toStrictEqual(
    [...ROLE_PERMISSIONS.ADMIN].sort(),
  );
  expect(hasPermission(["ADMIN"], PERMISSION.STAFF_MANAGE_BASIC_ROLES)).toBe(
    true,
  );
  expect(
    hasPermission(["ADMIN"], PERMISSION.STAFF_MANAGE_PRIVILEGED_ROLES),
  ).toBe(false);
  expect(hasPermission(["ADMIN"], PERMISSION.SYSTEM_EMERGENCY_LOCKDOWN)).toBe(
    false,
  );
});

test("TECHNICAL_ADMIN has exactly the technical operations set", () => {
  expect(permissionsFor("TECHNICAL_ADMIN")).toStrictEqual(
    [...ROLE_PERMISSIONS.TECHNICAL_ADMIN].sort(),
  );
  expect(
    hasPermission(
      ["TECHNICAL_ADMIN"],
      PERMISSION.OPERATIONS_MANAGE_INTEGRATIONS,
    ),
  ).toBe(true);
  expect(hasPermission(["TECHNICAL_ADMIN"], PERMISSION.STAFF_INVITE)).toBe(
    false,
  );
});

test("OWNER receives every defined permission", () => {
  expect(permissionsFor("OWNER")).toStrictEqual([...ALL_PERMISSIONS].sort());
  expect(hasAllPermissions(["OWNER"], ALL_PERMISSIONS)).toBe(true);
});

test("multiple roles form a deduplicated permission union", () => {
  const roles = [
    "CONTENT_EDITOR",
    "MODERATOR",
    "CONTENT_EDITOR",
  ] satisfies StaffRole[];
  const permissions = getEffectivePermissions(roles);
  const expected = new Set([
    ...ROLE_PERMISSIONS.CONTENT_EDITOR,
    ...ROLE_PERMISSIONS.MODERATOR,
  ]);

  expect([...permissions].sort()).toStrictEqual([...expected].sort());
  expect(permissions.size).toBe(expected.size);
  expect(
    hasAnyPermission(roles, [
      PERMISSION.CONTENT_DELETE,
      PERMISSION.MODERATION_ACTION,
    ]),
  ).toBe(true);
});

test("a user with no roles is not staff", () => {
  expect(isStaff([])).toBe(false);
  expect(() => requireStaff([])).toThrow(StaffRequiredError);
});

test("runtime staff-role validation accepts only defined Prisma roles", () => {
  expect(parseStaffRole("MODERATOR")).toBe("MODERATOR");
  expect(() => parseStaffRole("SUPER_ADMIN")).toThrow();
  expect(() => parseStaffRole({ role: "OWNER" })).toThrow();
});

test("permission and owner guards fail closed", () => {
  expect(() =>
    requirePermission(["MODERATOR"], PERMISSION.CONTENT_UPDATE),
  ).toThrow(PermissionRequiredError);
  expect(() =>
    requireAnyPermission(
      ["CONTENT_EDITOR"],
      [PERMISSION.MODERATION_ACTION, PERMISSION.SYSTEM_READ],
    ),
  ).toThrow(PermissionRequiredError);
  expect(() =>
    requireAllPermissions(
      ["ADMIN"],
      [
        PERMISSION.STAFF_MANAGE_BASIC_ROLES,
        PERMISSION.STAFF_MANAGE_PRIVILEGED_ROLES,
      ],
    ),
  ).toThrow(PermissionRequiredError);
  expect(() => requireOwner(["ADMIN"])).toThrow(OwnerRequiredError);
  expect(() => requireOwner(["OWNER"])).not.toThrow();
});
