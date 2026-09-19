import assert from "node:assert/strict";
import test from "node:test";

import type { StaffRole } from "@townhawll/db";

import {
  ALL_PERMISSIONS,
  getEffectivePermissions,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isStaff,
  OwnerRequiredError,
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

void test("CONTENT_EDITOR has exactly the editorial permission set", () => {
  assert.deepEqual(
    permissionsFor("CONTENT_EDITOR"),
    [...ROLE_PERMISSIONS.CONTENT_EDITOR].sort(),
  );
  assert.equal(
    hasPermission(["CONTENT_EDITOR"], PERMISSION.CONTENT_PUBLISH),
    true,
  );
  assert.equal(
    hasPermission(["CONTENT_EDITOR"], PERMISSION.CONTENT_DELETE),
    false,
  );
});

void test("MODERATOR has exactly the moderation permission set", () => {
  assert.deepEqual(
    permissionsFor("MODERATOR"),
    [...ROLE_PERMISSIONS.MODERATOR].sort(),
  );
  assert.equal(
    hasPermission(["MODERATOR"], PERMISSION.MODERATION_BAN_USER),
    true,
  );
  assert.equal(hasPermission(["MODERATOR"], PERMISSION.CONTENT_UPDATE), false);
});

void test("ADMIN has broad product operations without privileged staff control", () => {
  assert.deepEqual(permissionsFor("ADMIN"), [...ROLE_PERMISSIONS.ADMIN].sort());
  assert.equal(
    hasPermission(["ADMIN"], PERMISSION.STAFF_MANAGE_BASIC_ROLES),
    true,
  );
  assert.equal(
    hasPermission(["ADMIN"], PERMISSION.STAFF_MANAGE_PRIVILEGED_ROLES),
    false,
  );
  assert.equal(
    hasPermission(["ADMIN"], PERMISSION.SYSTEM_EMERGENCY_LOCKDOWN),
    false,
  );
});

void test("TECHNICAL_ADMIN has exactly the technical operations set", () => {
  assert.deepEqual(
    permissionsFor("TECHNICAL_ADMIN"),
    [...ROLE_PERMISSIONS.TECHNICAL_ADMIN].sort(),
  );
  assert.equal(
    hasPermission(
      ["TECHNICAL_ADMIN"],
      PERMISSION.OPERATIONS_MANAGE_INTEGRATIONS,
    ),
    true,
  );
  assert.equal(
    hasPermission(["TECHNICAL_ADMIN"], PERMISSION.STAFF_INVITE),
    false,
  );
});

void test("OWNER receives every defined permission", () => {
  assert.deepEqual(permissionsFor("OWNER"), [...ALL_PERMISSIONS].sort());
  assert.equal(hasAllPermissions(["OWNER"], ALL_PERMISSIONS), true);
});

void test("multiple roles form a deduplicated permission union", () => {
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

  assert.deepEqual([...permissions].sort(), [...expected].sort());
  assert.equal(permissions.size, expected.size);
  assert.equal(
    hasAnyPermission(roles, [
      PERMISSION.CONTENT_DELETE,
      PERMISSION.MODERATION_ACTION,
    ]),
    true,
  );
});

void test("a user with no roles is not staff", () => {
  assert.equal(isStaff([]), false);
  assert.throws(() => requireStaff([]), StaffRequiredError);
});

void test("permission and owner guards fail closed", () => {
  assert.throws(
    () => requirePermission(["MODERATOR"], PERMISSION.CONTENT_UPDATE),
    PermissionRequiredError,
  );
  assert.throws(
    () =>
      requireAnyPermission(
        ["CONTENT_EDITOR"],
        [PERMISSION.MODERATION_ACTION, PERMISSION.SYSTEM_READ],
      ),
    PermissionRequiredError,
  );
  assert.throws(
    () =>
      requireAllPermissions(
        ["ADMIN"],
        [
          PERMISSION.STAFF_MANAGE_BASIC_ROLES,
          PERMISSION.STAFF_MANAGE_PRIVILEGED_ROLES,
        ],
      ),
    PermissionRequiredError,
  );
  assert.throws(() => requireOwner(["ADMIN"]), OwnerRequiredError);
  assert.doesNotThrow(() => requireOwner(["OWNER"]));
});
