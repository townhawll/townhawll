import { expect, test } from "vitest";

import { getPostAuthDestination } from "./onboarding.ts";

test("incomplete accounts enter onboarding with a safe return URL", () => {
  expect(getPostAuthDestination(null, "/game/example?tab=reviews")).toBe(
    "/onboarding?callbackUrl=%2Fgame%2Fexample%3Ftab%3Dreviews",
  );
  expect(getPostAuthDestination(null, "https://evil.example")).toBe(
    "/onboarding?callbackUrl=%2Fsettings%2Fprofile",
  );
  expect(getPostAuthDestination(null, "/onboarding")).toBe("/onboarding");
});

test("completed accounts bypass onboarding and retain safe callbacks", () => {
  const completedAt = new Date();
  expect(getPostAuthDestination(completedAt, "/game/example")).toBe(
    "/game/example",
  );
  expect(getPostAuthDestination(completedAt, "/onboarding")).toBe(
    "/settings/profile",
  );
  expect(getPostAuthDestination(completedAt, "//evil.example")).toBe(
    "/settings/profile",
  );
});
