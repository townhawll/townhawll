import assert from "node:assert/strict";
import test from "node:test";

import type { AccountStatus, StaffRole } from "@townhawll/db";

import { PERMISSION } from "./permissions.ts";
import {
  getStaffAccessBySessionToken,
  resolveStaffAccess,
  type SessionIdentity,
} from "./staff-context.ts";

function identity(overrides: Partial<SessionIdentity> = {}): SessionIdentity {
  return {
    email: "staff@example.com",
    emailVerified: new Date("2026-09-19T00:00:00.000Z"),
    id: "user_1",
    name: "Staff User",
    roles: ["CONTENT_EDITOR"],
    status: "ACTIVE",
    ...overrides,
  };
}

void test("a valid user with one role resolves to current staff", () => {
  const state = resolveStaffAccess(identity());
  assert.equal(state.status, "authorized");
  if (state.status === "authorized") {
    assert.deepEqual(state.staff.roles, ["CONTENT_EDITOR"]);
    assert.equal(state.staff.permissions.has(PERMISSION.CONTENT_PUBLISH), true);
  }
});

void test("multiple roles resolve to a current permission union", () => {
  const roles = ["CONTENT_EDITOR", "MODERATOR"] satisfies StaffRole[];
  const state = resolveStaffAccess(identity({ roles }));
  assert.equal(state.status, "authorized");
  if (state.status === "authorized") {
    assert.equal(state.staff.permissions.has(PERMISSION.CONTENT_PUBLISH), true);
    assert.equal(
      state.staff.permissions.has(PERMISSION.MODERATION_ACTION),
      true,
    );
  }
});

void test("a normal authenticated user is forbidden", () => {
  assert.deepEqual(resolveStaffAccess(identity({ roles: [] })), {
    reason: "roles",
    status: "forbidden",
  });
});

void test("unverified and non-active accounts are forbidden", () => {
  assert.deepEqual(resolveStaffAccess(identity({ emailVerified: null })), {
    reason: "verification",
    status: "forbidden",
  });

  for (const status of [
    "RESTRICTED",
    "SUSPENDED",
    "BANNED",
    "DELETED",
  ] satisfies AccountStatus[]) {
    assert.deepEqual(resolveStaffAccess(identity({ status })), {
      reason: "account",
      status: "forbidden",
    });
  }
});

void test("missing and expired sessions are unauthenticated", async () => {
  const now = new Date("2026-09-19T12:00:00.000Z");
  assert.deepEqual(await getStaffAccessBySessionToken(undefined), {
    status: "unauthenticated",
  });

  let expiredSessionDeleted = false;
  const state = await getStaffAccessBySessionToken(
    "expired-token",
    {
      deleteExpiredSession: () => {
        expiredSessionDeleted = true;
        return Promise.resolve();
      },
      findSession: () =>
        Promise.resolve({
          expires: new Date("2026-09-19T11:59:59.000Z"),
          user: identity(),
        }),
    },
    now,
  );

  assert.deepEqual(state, { status: "unauthenticated" });
  assert.equal(expiredSessionDeleted, true);
});

void test("session lookup evaluates fresh staff roles", async () => {
  const state = await getStaffAccessBySessionToken("valid-token", {
    deleteExpiredSession: () => Promise.resolve(),
    findSession: () =>
      Promise.resolve({
        expires: new Date("2026-09-20T00:00:00.000Z"),
        user: identity({ roles: ["OWNER"] }),
      }),
  });

  assert.equal(state.status, "authorized");
  if (state.status === "authorized") {
    assert.deepEqual(state.staff.roles, ["OWNER"]);
    assert.equal(
      state.staff.permissions.has(PERMISSION.SYSTEM_EMERGENCY_LOCKDOWN),
      true,
    );
  }
});
