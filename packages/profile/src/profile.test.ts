import assert from "node:assert/strict";
import test from "node:test";

import {
  contentFocusSchema,
  normalizeUsername,
  profileInputSchema,
  usernameSchema,
} from "./index.ts";

void test("usernames normalize before validation", () => {
  assert.equal(normalizeUsername("  Town_User  "), "town_user");
  assert.equal(usernameSchema.parse("  Town_User  "), "town_user");
});

void test("usernames reject unsafe, reserved, and out-of-range values", () => {
  for (const value of [
    "ab",
    "a".repeat(31),
    "two words",
    "a-b",
    "näme",
    "admin",
    "SIGNUP",
    "townhawll",
  ]) {
    assert.equal(usernameSchema.safeParse(value).success, false, value);
  }
  assert.equal(usernameSchema.safeParse("player_123").success, true);
});

void test("content focus accepts exactly one supported preference", () => {
  for (const value of ["GAMES", "SCREEN", "BOTH"]) {
    assert.equal(contentFocusSchema.parse(value), value);
  }
  assert.equal(contentFocusSchema.safeParse("MOVIES").success, false);
  assert.equal(
    contentFocusSchema.safeParse(["GAMES", "SCREEN"]).success,
    false,
  );
});

void test("profile input validates identity and the selected focus", () => {
  const result = profileInputSchema.parse({
    username: "  Player_123 ",
    displayName: " Player ",
    contentFocus: "BOTH",
  });
  assert.equal(result.username, "player_123");
  assert.equal(result.displayName, "Player");
  assert.equal(result.contentFocus, "BOTH");
});
