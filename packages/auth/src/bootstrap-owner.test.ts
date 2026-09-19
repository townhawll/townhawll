import assert from "node:assert/strict";
import test from "node:test";

import {
  bootstrapFirstOwner,
  OwnerBootstrapProductionError,
  OwnerBootstrapUserError,
} from "./bootstrap-owner.ts";

void test("first OWNER bootstrap normalizes the selected account email", async () => {
  let selectedEmail: string | undefined;
  const result = await bootstrapFirstOwner(" OWNER@Example.COM ", {
    dependencies: {
      assignFirstOwner(email) {
        selectedEmail = email;
        return Promise.resolve({ userId: "user_1" });
      },
    },
    nodeEnv: "development",
  });

  assert.equal(selectedEmail, "owner@example.com");
  assert.deepEqual(result, { userId: "user_1" });
});

void test("OWNER bootstrap rejects invalid emails before database access", async () => {
  let called = false;
  await assert.rejects(
    bootstrapFirstOwner("not-an-email", {
      dependencies: {
        assignFirstOwner() {
          called = true;
          return Promise.resolve({ userId: "user_1" });
        },
      },
      nodeEnv: "development",
    }),
    OwnerBootstrapUserError,
  );
  assert.equal(called, false);
});

void test("OWNER bootstrap is disabled in production", async () => {
  await assert.rejects(
    bootstrapFirstOwner("owner@example.com", {
      dependencies: {
        assignFirstOwner() {
          return Promise.resolve({ userId: "user_1" });
        },
      },
      nodeEnv: "production",
    }),
    OwnerBootstrapProductionError,
  );
});
