import assert from "node:assert/strict";
import test from "node:test";

import type { StaffAccessState } from "@townhawll/auth/staff-context";

import {
  getAdminLoginDestination,
  getAdminRootDestination,
  getSafeAdminCallbackUrl,
} from "./auth-flow";

const unauthenticated = {
  status: "unauthenticated",
} satisfies StaffAccessState;
const forbidden = {
  reason: "roles",
  status: "forbidden",
} satisfies StaffAccessState;
const authorized = {
  status: "authorized",
  staff: {
    accountStatus: "ACTIVE",
    email: "staff@example.com",
    name: "Staff",
    permissions: new Set(),
    roles: ["CONTENT_EDITOR"],
    userId: "user_1",
  },
} satisfies StaffAccessState;

void test("admin root routes each access state without a redirect loop", () => {
  assert.equal(getAdminRootDestination(unauthenticated), "/login");
  assert.equal(getAdminRootDestination(forbidden), "/403");
  assert.equal(getAdminRootDestination(authorized), "/dashboard");
});

void test("login stays visible only for unauthenticated visitors", () => {
  assert.equal(getAdminLoginDestination(unauthenticated, null), null);
  assert.equal(getAdminLoginDestination(forbidden, null), "/403");
  assert.equal(
    getAdminLoginDestination(authorized, "/content?tab=drafts"),
    "/content?tab=drafts",
  );
});

void test("admin callbacks reject external and login-loop destinations", () => {
  assert.equal(getSafeAdminCallbackUrl("https://example.com"), "/dashboard");
  assert.equal(getSafeAdminCallbackUrl("//example.com"), "/dashboard");
  assert.equal(getSafeAdminCallbackUrl("/login"), "/dashboard");
  assert.equal(getSafeAdminCallbackUrl("/login?next=/login"), "/dashboard");
});
