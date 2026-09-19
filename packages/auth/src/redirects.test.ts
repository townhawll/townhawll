import { expect, test } from "vitest";

import {
  DEFAULT_AUTHENTICATED_DESTINATION,
  getLoginUrl,
  getSafeCallbackUrl,
} from "./redirects.ts";

test("preserves safe internal callback destinations", () => {
  expect(getSafeCallbackUrl("/game/townhawll?tab=reviews#top")).toBe(
    "/game/townhawll?tab=reviews#top",
  );
});

test("builds the protected-route login redirect", () => {
  expect(getLoginUrl("/game/townhawll?tab=reviews")).toBe(
    "/login?callbackUrl=%2Fgame%2Ftownhawll%3Ftab%3Dreviews",
  );
});

test("rejects external, protocol-relative, and backslash redirects", () => {
  for (const value of [
    "https://attacker.example",
    "//attacker.example/path",
    "/\\attacker.example/path",
    "javascript:alert(1)",
  ]) {
    expect(getSafeCallbackUrl(value)).toBe(DEFAULT_AUTHENTICATED_DESTINATION);
  }
});

test("uses the caller-provided safe fallback for logout", () => {
  expect(getSafeCallbackUrl("https://attacker.example", "/")).toBe("/");
});
