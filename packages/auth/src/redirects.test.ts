import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AUTHENTICATED_DESTINATION,
  getLoginUrl,
  getSafeCallbackUrl,
} from "./redirects.ts";

void test("preserves safe internal callback destinations", () => {
  assert.equal(
    getSafeCallbackUrl("/game/townhawll?tab=reviews#top"),
    "/game/townhawll?tab=reviews#top",
  );
});

void test("builds the protected-route login redirect", () => {
  assert.equal(
    getLoginUrl("/game/townhawll?tab=reviews"),
    "/login?callbackUrl=%2Fgame%2Ftownhawll%3Ftab%3Dreviews",
  );
});

void test("rejects external, protocol-relative, and backslash redirects", () => {
  for (const value of [
    "https://attacker.example",
    "//attacker.example/path",
    "/\\attacker.example/path",
    "javascript:alert(1)",
  ]) {
    assert.equal(getSafeCallbackUrl(value), DEFAULT_AUTHENTICATED_DESTINATION);
  }
});

void test("uses the caller-provided safe fallback for logout", () => {
  assert.equal(getSafeCallbackUrl("https://attacker.example", "/"), "/");
});
