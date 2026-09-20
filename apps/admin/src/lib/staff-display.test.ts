import { expect, test } from "vitest";

import { getStaffRoleLabel, getStaffRoleSummary } from "./staff-display";

test("staff roles use compact human-readable labels", () => {
  expect(getStaffRoleLabel("TECHNICAL_ADMIN")).toBe("Technical admin");
  expect(getStaffRoleSummary(["ADMIN", "CONTENT_EDITOR"])).toBe(
    "Admin + Content editor",
  );
});
