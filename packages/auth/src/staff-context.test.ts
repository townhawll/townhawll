import { expect, test } from "vitest";

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

test("a valid user with one role resolves to current staff", () => {
  const state = resolveStaffAccess(identity());
  expect(state.status).toBe("authorized");
  if (state.status === "authorized") {
    expect(state.staff.roles).toStrictEqual(["CONTENT_EDITOR"]);
    expect(state.staff.permissions.has(PERMISSION.CONTENT_PUBLISH)).toBe(true);
  }
});

test("multiple roles resolve to a current permission union", () => {
  const roles = ["CONTENT_EDITOR", "MODERATOR"] satisfies StaffRole[];
  const state = resolveStaffAccess(identity({ roles }));
  expect(state.status).toBe("authorized");
  if (state.status === "authorized") {
    expect(state.staff.permissions.has(PERMISSION.CONTENT_PUBLISH)).toBe(true);
    expect(state.staff.permissions.has(PERMISSION.MODERATION_ACTION)).toBe(
      true,
    );
  }
});

test("a normal authenticated user is forbidden", () => {
  expect(resolveStaffAccess(identity({ roles: [] }))).toStrictEqual({
    reason: "roles",
    status: "forbidden",
  });
});

test("unverified and non-active accounts are forbidden", () => {
  expect(resolveStaffAccess(identity({ emailVerified: null }))).toStrictEqual({
    reason: "verification",
    status: "forbidden",
  });

  for (const status of [
    "RESTRICTED",
    "SUSPENDED",
    "BANNED",
    "DELETED",
  ] satisfies AccountStatus[]) {
    expect(resolveStaffAccess(identity({ status }))).toStrictEqual({
      reason: "account",
      status: "forbidden",
    });
  }
});

test("missing and expired sessions are unauthenticated", async () => {
  const now = new Date("2026-09-19T12:00:00.000Z");
  expect(await getStaffAccessBySessionToken(undefined)).toStrictEqual({
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

  expect(state).toStrictEqual({ status: "unauthenticated" });
  expect(expiredSessionDeleted).toBe(true);
});

test("session lookup evaluates fresh staff roles", async () => {
  const state = await getStaffAccessBySessionToken("valid-token", {
    deleteExpiredSession: () => Promise.resolve(),
    findSession: () =>
      Promise.resolve({
        expires: new Date("2026-09-20T00:00:00.000Z"),
        user: identity({ roles: ["OWNER"] }),
      }),
  });

  expect(state.status).toBe("authorized");
  if (state.status === "authorized") {
    expect(state.staff.roles).toStrictEqual(["OWNER"]);
    expect(
      state.staff.permissions.has(PERMISSION.SYSTEM_EMERGENCY_LOCKDOWN),
    ).toBe(true);
  }
});
