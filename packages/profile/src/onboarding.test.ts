import assert from "node:assert/strict";
import test from "node:test";

import { onboardingFocusSchema, onboardingProfileSchema } from "./index.ts";
import {
  getContentFocusDestination,
  getInitialOnboardingStep,
  needsOnboarding,
} from "./onboarding.ts";

void test("profile step validates username, display name, and optional bio", () => {
  const value = onboardingProfileSchema.parse({
    username: "  Player_123  ",
    displayName: "  Player  ",
    bio: "",
  });
  assert.equal(value.username, "player_123");
  assert.equal(value.displayName, "Player");
  assert.equal(
    onboardingProfileSchema.safeParse({
      username: "admin",
      displayName: "Player",
      bio: "",
    }).success,
    false,
  );
  assert.equal(
    onboardingProfileSchema.safeParse({
      username: "player",
      displayName: "",
      bio: "",
    }).success,
    false,
  );
});

void test("exactly one content focus is required and determines the destination", () => {
  assert.equal(onboardingFocusSchema.safeParse({}).success, false);
  assert.equal(
    onboardingFocusSchema.safeParse({ contentFocus: "MOVIES" }).success,
    false,
  );
  assert.equal(getContentFocusDestination("GAMES"), "/games");
  assert.equal(getContentFocusDestination("SCREEN"), "/screen");
  assert.equal(getContentFocusDestination("BOTH"), "/");
});

void test("only a completion timestamp bypasses onboarding", () => {
  assert.equal(needsOnboarding(null), true);
  assert.equal(needsOnboarding(undefined), true);
  assert.equal(needsOnboarding(new Date()), false);
  assert.equal(getInitialOnboardingStep(null), 1);
  assert.equal(getInitialOnboardingStep(new Date()), 2);
});
