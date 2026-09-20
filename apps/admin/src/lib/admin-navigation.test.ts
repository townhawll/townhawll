import {
  getEffectivePermissions,
  PERMISSION,
} from "@townhawll/auth/permissions";
import { expect, test } from "vitest";

import {
  ADMIN_NAVIGATION,
  getVisibleAdminNavigation,
  type AdminNavigationItem,
} from "./admin-navigation";

const icon = ADMIN_NAVIGATION[0].icon;
const testNavigation = [
  ADMIN_NAVIGATION[0],
  {
    group: "Test",
    href: "/content-test",
    icon,
    label: "Content test",
    requirement: {
      mode: "all",
      permissions: [PERMISSION.CONTENT_READ, PERMISSION.CONTENT_UPDATE],
    },
  },
  {
    group: "Test",
    href: "/moderation-test",
    icon,
    label: "Moderation test",
    requirement: {
      mode: "any",
      permissions: [PERMISSION.MODERATION_READ, PERMISSION.MODERATION_ACTION],
    },
  },
] as const satisfies readonly AdminNavigationItem[];

function labels(items: readonly AdminNavigationItem[]) {
  return items.map((item) => item.label);
}

test("the current admin navigation exposes only implemented routes", () => {
  expect(labels(getVisibleAdminNavigation(new Set()))).toStrictEqual([
    "Dashboard",
  ]);
});

test("navigation excludes links without the required permission", () => {
  const moderatorPermissions = getEffectivePermissions(["MODERATOR"]);

  expect(
    labels(getVisibleAdminNavigation(moderatorPermissions, testNavigation)),
  ).toStrictEqual(["Dashboard", "Moderation test"]);
});

test("combined roles produce union-based navigation", () => {
  const permissions = getEffectivePermissions(["CONTENT_EDITOR", "MODERATOR"]);

  expect(
    labels(getVisibleAdminNavigation(permissions, testNavigation)),
  ).toStrictEqual(["Dashboard", "Content test", "Moderation test"]);
});

test("OWNER can see every currently configured navigation item", () => {
  const permissions = getEffectivePermissions(["OWNER"]);

  expect(
    labels(getVisibleAdminNavigation(permissions, testNavigation)),
  ).toStrictEqual(labels(testNavigation));
});
