import { expect, test } from "vitest";

import { onboardingFocusSchema, onboardingProfileSchema } from "./index.ts";
import {
  getContentFocusDestination,
  getInitialOnboardingStep,
  needsOnboarding,
} from "./onboarding.ts";

test("profile step validates username, display name, and optional bio", () => {
  const value = onboardingProfileSchema.parse({
    username: "  Player_123  ",
    displayName: "  Player  ",
    bio: "",
  });
  expect(value.username).toBe("player_123");
  expect(value.displayName).toBe("Player");
  expect(
    onboardingProfileSchema.safeParse({
      username: "admin",
      displayName: "Player",
      bio: "",
    }).success,
  ).toBe(false);
  expect(
    onboardingProfileSchema.safeParse({
      username: "player",
      displayName: "",
      bio: "",
    }).success,
  ).toBe(false);
});

test("exactly one content focus is required and determines the destination", () => {
  expect(onboardingFocusSchema.safeParse({}).success).toBe(false);
  expect(
    onboardingFocusSchema.safeParse({ contentFocus: "MOVIES" }).success,
  ).toBe(false);
  expect(getContentFocusDestination("GAMES")).toBe("/games");
  expect(getContentFocusDestination("SCREEN")).toBe("/screen");
  expect(getContentFocusDestination("BOTH")).toBe("/");
});

test("only a completion timestamp bypasses onboarding", () => {
  expect(needsOnboarding(null)).toBe(true);
  expect(needsOnboarding(undefined)).toBe(true);
  expect(needsOnboarding(new Date())).toBe(false);
  expect(getInitialOnboardingStep(null)).toBe(1);
  expect(getInitialOnboardingStep(new Date())).toBe(2);
});
