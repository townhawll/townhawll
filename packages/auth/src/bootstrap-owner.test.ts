import { expect, test, vi } from "vitest";

import {
  bootstrapFirstOwner,
  OwnerBootstrapProductionError,
  OwnerBootstrapUserError,
} from "./bootstrap-owner.ts";

test("first OWNER bootstrap normalizes the selected account email", async () => {
  const assignFirstOwner = vi.fn(() => Promise.resolve({ userId: "user_1" }));
  const result = await bootstrapFirstOwner(" OWNER@Example.COM ", {
    dependencies: { assignFirstOwner },
    nodeEnv: "development",
  });

  expect(assignFirstOwner).toHaveBeenCalledOnce();
  expect(assignFirstOwner).toHaveBeenCalledWith("owner@example.com");
  expect(result).toStrictEqual({ userId: "user_1" });
});

test("OWNER bootstrap rejects invalid emails before database access", async () => {
  const assignFirstOwner = vi.fn(() => Promise.resolve({ userId: "user_1" }));
  await expect(
    bootstrapFirstOwner("not-an-email", {
      dependencies: { assignFirstOwner },
      nodeEnv: "development",
    }),
  ).rejects.toThrow(OwnerBootstrapUserError);
  expect(assignFirstOwner).not.toHaveBeenCalled();
});

test("OWNER bootstrap is disabled in production", async () => {
  const assignFirstOwner = vi.fn(() => Promise.resolve({ userId: "user_1" }));
  await expect(
    bootstrapFirstOwner("owner@example.com", {
      dependencies: { assignFirstOwner },
      nodeEnv: "production",
    }),
  ).rejects.toThrow(OwnerBootstrapProductionError);
  expect(assignFirstOwner).not.toHaveBeenCalled();
});
