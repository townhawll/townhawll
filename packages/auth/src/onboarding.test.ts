import assert from "node:assert/strict";
import test from "node:test";

import { getPostAuthDestination } from "./onboarding.ts";

void test("incomplete accounts enter onboarding with a safe return URL", () => {
  assert.equal(
    getPostAuthDestination(null, "/game/example?tab=reviews"),
    "/onboarding?callbackUrl=%2Fgame%2Fexample%3Ftab%3Dreviews",
  );
  assert.equal(
    getPostAuthDestination(null, "https://evil.example"),
    "/onboarding?callbackUrl=%2Fsettings%2Fprofile",
  );
  assert.equal(getPostAuthDestination(null, "/onboarding"), "/onboarding");
});

void test("completed accounts bypass onboarding and retain safe callbacks", () => {
  const completedAt = new Date();
  assert.equal(
    getPostAuthDestination(completedAt, "/game/example"),
    "/game/example",
  );
  assert.equal(
    getPostAuthDestination(completedAt, "/onboarding"),
    "/settings/profile",
  );
  assert.equal(
    getPostAuthDestination(completedAt, "//evil.example"),
    "/settings/profile",
  );
});
