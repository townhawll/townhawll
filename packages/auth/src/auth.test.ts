import { expect, test } from "vitest";
import type { Session } from "next-auth";

import { normalizeEmail, normalizeUsername } from "./account.ts";
import {
  AccountUnavailableError,
  AuthenticationRequiredError,
  EmailVerificationRequiredError,
  requireUser,
  requireVerifiedUser,
} from "./guards.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { createAuthToken, hashAuthToken } from "./tokens.ts";

test("normalizes account identifiers consistently", () => {
  expect(normalizeEmail("  USER@Example.COM ")).toBe("user@example.com");
  expect(normalizeUsername("  TownHawllUser ")).toBe("townhawlluser");
});

test("hashes and verifies passwords with an encoded Argon2id hash", async () => {
  const password = "correct horse battery staple";
  const passwordHash = await hashPassword(password);

  expect(passwordHash).toMatch(/^\$argon2id\$/);
  expect(await verifyPassword(passwordHash, password)).toBe(true);
  expect(await verifyPassword(passwordHash, "incorrect password")).toBe(false);
});

test("creates opaque tokens and stores only their deterministic hashes", () => {
  const first = createAuthToken();
  const second = createAuthToken();

  expect(first.token).not.toBe(second.token);
  expect(first.tokenHash).not.toBe(second.tokenHash);
  expect(first.tokenHash).toBe(hashAuthToken(first.token));
  expect(first.tokenHash.length).toBe(64);
});

test("requires an authenticated and verified user", () => {
  const unverifiedSession = {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: {
      email: "user@example.com",
      emailVerified: null,
      id: "user_1",
      name: null,
      status: "ACTIVE",
      username: "townhawlluser",
    },
  } satisfies Session;

  expect(() => requireUser(null)).toThrow(AuthenticationRequiredError);
  expect(() => requireVerifiedUser(unverifiedSession)).toThrow(
    EmailVerificationRequiredError,
  );

  const verifiedAt = new Date();
  const verifiedUser = requireVerifiedUser({
    ...unverifiedSession,
    user: {
      ...unverifiedSession.user,
      emailVerified: verifiedAt,
    },
  });

  expect(verifiedUser.emailVerified).toBe(verifiedAt);

  expect(() =>
    requireUser({
      ...unverifiedSession,
      user: { ...unverifiedSession.user, status: "BANNED" },
    }),
  ).toThrow(AccountUnavailableError);
});
