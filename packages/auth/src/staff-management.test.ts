import { expect, test } from "vitest";

import {
  canAssignRole,
  canManageStaff,
  canRemoveRole,
} from "./staff-management.ts";

test("ADMIN can manage basic staff", () => {
  expect(canManageStaff(["ADMIN"], ["CONTENT_EDITOR"])).toBe(true);
  expect(canManageStaff(["ADMIN"], ["MODERATOR"])).toBe(true);
  expect(canAssignRole(["ADMIN"], [], "CONTENT_EDITOR")).toBe(true);
  expect(canAssignRole(["ADMIN"], ["CONTENT_EDITOR"], "MODERATOR")).toBe(true);
  expect(canRemoveRole(["ADMIN"], ["CONTENT_EDITOR"], "CONTENT_EDITOR")).toBe(
    true,
  );
  expect(canRemoveRole(["ADMIN"], ["MODERATOR"], "MODERATOR")).toBe(true);
});

test("ADMIN cannot manage or grant privileged roles", () => {
  for (const role of ["ADMIN", "TECHNICAL_ADMIN", "OWNER"] as const) {
    expect(canManageStaff(["ADMIN"], [role])).toBe(false);
    expect(canAssignRole(["ADMIN"], [], role)).toBe(false);
    expect(canRemoveRole(["ADMIN"], [role], role)).toBe(false);
  }
});

test("OWNER can manage and grant privileged roles", () => {
  for (const role of [
    "CONTENT_EDITOR",
    "MODERATOR",
    "ADMIN",
    "TECHNICAL_ADMIN",
    "OWNER",
  ] as const) {
    expect(canManageStaff(["OWNER"], [role])).toBe(true);
    expect(canAssignRole(["OWNER"], [], role)).toBe(true);
    if (role !== "OWNER") {
      expect(canRemoveRole(["OWNER"], [role], role)).toBe(true);
    }
  }
});

test("non-management roles cannot escalate privileges", () => {
  expect(canManageStaff(["TECHNICAL_ADMIN"], ["MODERATOR"])).toBe(false);
  expect(canAssignRole(["MODERATOR"], [], "ADMIN")).toBe(false);
  expect(canRemoveRole(["CONTENT_EDITOR"], ["MODERATOR"], "MODERATOR")).toBe(
    false,
  );
});

test("ADMIN cannot modify a target that also has a privileged role", () => {
  expect(canManageStaff(["ADMIN"], ["CONTENT_EDITOR", "TECHNICAL_ADMIN"])).toBe(
    false,
  );
  for (const privilegedRole of ["ADMIN", "TECHNICAL_ADMIN", "OWNER"] as const) {
    expect(canAssignRole(["ADMIN"], [privilegedRole], "CONTENT_EDITOR")).toBe(
      false,
    );
    expect(
      canRemoveRole(
        ["ADMIN"],
        [privilegedRole, "CONTENT_EDITOR"],
        "CONTENT_EDITOR",
      ),
    ).toBe(false);
  }
});

test("ADMIN cannot modify its own privileged account indirectly", () => {
  expect(canAssignRole(["ADMIN"], ["ADMIN"], "MODERATOR")).toBe(false);
  expect(
    canRemoveRole(["ADMIN"], ["ADMIN", "CONTENT_EDITOR"], "CONTENT_EDITOR"),
  ).toBe(false);
});

test("OWNER may remove OWNER only when another OWNER remains", () => {
  expect(
    canRemoveRole(["OWNER"], ["OWNER"], "OWNER", {
      currentOwnerCount: 1,
    }),
  ).toBe(false);
  expect(canRemoveRole(["OWNER"], ["OWNER"], "OWNER")).toBe(false);
  expect(
    canRemoveRole(["OWNER"], ["OWNER"], "OWNER", {
      currentOwnerCount: 2,
    }),
  ).toBe(true);
});
