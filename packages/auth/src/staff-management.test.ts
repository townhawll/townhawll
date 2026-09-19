import assert from "node:assert/strict";
import test from "node:test";

import {
  canAssignRole,
  canManageStaff,
  canRemoveRole,
} from "./staff-management.ts";

void test("ADMIN can manage basic staff", () => {
  assert.equal(canManageStaff(["ADMIN"], ["CONTENT_EDITOR"]), true);
  assert.equal(canManageStaff(["ADMIN"], ["MODERATOR"]), true);
  assert.equal(canAssignRole(["ADMIN"], "CONTENT_EDITOR"), true);
  assert.equal(canAssignRole(["ADMIN"], "MODERATOR"), true);
  assert.equal(canRemoveRole(["ADMIN"], "CONTENT_EDITOR"), true);
  assert.equal(canRemoveRole(["ADMIN"], "MODERATOR"), true);
});

void test("ADMIN cannot manage or grant privileged roles", () => {
  for (const role of ["ADMIN", "TECHNICAL_ADMIN", "OWNER"] as const) {
    assert.equal(canManageStaff(["ADMIN"], [role]), false);
    assert.equal(canAssignRole(["ADMIN"], role), false);
    assert.equal(canRemoveRole(["ADMIN"], role), false);
  }
});

void test("OWNER can manage and grant privileged roles", () => {
  for (const role of [
    "CONTENT_EDITOR",
    "MODERATOR",
    "ADMIN",
    "TECHNICAL_ADMIN",
    "OWNER",
  ] as const) {
    assert.equal(canManageStaff(["OWNER"], [role]), true);
    assert.equal(canAssignRole(["OWNER"], role), true);
    assert.equal(canRemoveRole(["OWNER"], role), true);
  }
});

void test("non-management roles cannot escalate privileges", () => {
  assert.equal(canManageStaff(["TECHNICAL_ADMIN"], ["MODERATOR"]), false);
  assert.equal(canAssignRole(["MODERATOR"], "ADMIN"), false);
  assert.equal(canRemoveRole(["CONTENT_EDITOR"], "MODERATOR"), false);
});

void test("ADMIN cannot modify a target that also has a privileged role", () => {
  assert.equal(
    canManageStaff(["ADMIN"], ["CONTENT_EDITOR", "TECHNICAL_ADMIN"]),
    false,
  );
});
