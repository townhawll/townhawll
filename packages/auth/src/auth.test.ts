import assert from "node:assert/strict";
import test from "node:test";
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

void test("normalizes account identifiers consistently", () => {
  assert.equal(normalizeEmail("  USER@Example.COM "), "user@example.com");
  assert.equal(normalizeUsername("  TownHawllUser "), "townhawlluser");
});

void test("hashes and verifies passwords with an encoded Argon2id hash", async () => {
  const password = "correct horse battery staple";
  const passwordHash = await hashPassword(password);

  assert.match(passwordHash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(passwordHash, password), true);
  assert.equal(await verifyPassword(passwordHash, "incorrect password"), false);
});

void test("creates opaque tokens and stores only their deterministic hashes", () => {
  const first = createAuthToken();
  const second = createAuthToken();

  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, second.tokenHash);
  assert.equal(first.tokenHash, hashAuthToken(first.token));
  assert.equal(first.tokenHash.length, 64);
});

void test("requires an authenticated and verified user", () => {
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

  assert.throws(() => requireUser(null), AuthenticationRequiredError);
  assert.throws(
    () => requireVerifiedUser(unverifiedSession),
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

  assert.equal(verifiedUser.emailVerified, verifiedAt);

  assert.throws(
    () =>
      requireUser({
        ...unverifiedSession,
        user: { ...unverifiedSession.user, status: "BANNED" },
      }),
    AccountUnavailableError,
  );
});
