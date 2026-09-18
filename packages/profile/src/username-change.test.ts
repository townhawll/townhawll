import assert from "node:assert/strict";
import test from "node:test";

import {
  getUsernameChangeState,
  usernameConfirmationMatches,
} from "./username-change.ts";
import { usernameChangeSchema } from "./index.ts";

void test("username confirmation is required only for a changed username", () => {
  assert.deepEqual(getUsernameChangeState("takshil", " TaKsHiL "), {
    changed: false,
    normalizedUsername: "takshil",
  });
  assert.deepEqual(getUsernameChangeState("takshil", "takshilcodes"), {
    changed: true,
    normalizedUsername: "takshilcodes",
  });
});

void test("confirmation requires the exact normalized username", () => {
  assert.equal(usernameConfirmationMatches("takshilcodes", ""), false);
  assert.equal(
    usernameConfirmationMatches("takshilcodes", "TakshilCodes"),
    false,
  );
  assert.equal(
    usernameConfirmationMatches("takshilcodes", "takshilcodes"),
    true,
  );
});

void test("server schema rejects a confirmation that does not match", () => {
  assert.equal(
    usernameChangeSchema.safeParse({
      username: "TakshilCodes",
      confirmation: "TakshilCodes",
    }).success,
    false,
  );
  assert.equal(
    usernameChangeSchema.safeParse({
      username: "TakshilCodes",
      confirmation: "takshilcodes",
    }).success,
    true,
  );
});
