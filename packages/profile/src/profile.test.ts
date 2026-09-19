import { expect, test } from "vitest";

import {
  contentFocusSchema,
  normalizeUsername,
  profileInputSchema,
  usernameSchema,
} from "./index.ts";

test("usernames normalize before validation", () => {
  expect(normalizeUsername("  Town_User  ")).toBe("town_user");
  expect(usernameSchema.parse("  Town_User  ")).toBe("town_user");
});

test("usernames reject unsafe, reserved, and out-of-range values", () => {
  for (const value of [
    "ab",
    "a".repeat(31),
    "two words",
    "a-b",
    "näme",
    "admin",
    "SIGNUP",
    "townhawll",
    "onboarding",
  ]) {
    expect(usernameSchema.safeParse(value).success, value).toBe(false);
  }
  expect(usernameSchema.safeParse("player_123").success).toBe(true);
});

test("content focus accepts exactly one supported preference", () => {
  for (const value of ["GAMES", "SCREEN", "BOTH"]) {
    expect(contentFocusSchema.parse(value)).toBe(value);
  }
  expect(contentFocusSchema.safeParse("MOVIES").success).toBe(false);
  expect(contentFocusSchema.safeParse(["GAMES", "SCREEN"]).success).toBe(false);
});

test("profile input validates identity and the selected focus", () => {
  const result = profileInputSchema.parse({
    username: "  Player_123 ",
    displayName: " Player ",
    contentFocus: "BOTH",
  });
  expect(result.username).toBe("player_123");
  expect(result.displayName).toBe("Player");
  expect(result.contentFocus).toBe("BOTH");
});
