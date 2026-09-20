import { expect, test } from "vitest";

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
    username: "staff_user",
  },
} satisfies StaffAccessState;

test("admin root routes each access state without a redirect loop", () => {
  expect(getAdminRootDestination(unauthenticated)).toBe("/login");
  expect(getAdminRootDestination(forbidden)).toBe("/403");
  expect(getAdminRootDestination(authorized)).toBe("/dashboard");
});

test("login stays visible only for unauthenticated visitors", () => {
  expect(getAdminLoginDestination(unauthenticated, null)).toBe(null);
  expect(getAdminLoginDestination(forbidden, null)).toBe("/403");
  expect(getAdminLoginDestination(authorized, "/content?tab=drafts")).toBe(
    "/content?tab=drafts",
  );
});

test("admin callbacks reject external and login-loop destinations", () => {
  expect(getSafeAdminCallbackUrl("https://example.com")).toBe("/dashboard");
  expect(getSafeAdminCallbackUrl("//example.com")).toBe("/dashboard");
  expect(getSafeAdminCallbackUrl("/login")).toBe("/dashboard");
  expect(getSafeAdminCallbackUrl("/login?next=/login")).toBe("/dashboard");
});
