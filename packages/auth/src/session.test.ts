import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  createSessionRecord,
  endDatabaseSession,
  getAuthSessionCookieName,
  getAuthSessionCookieOptions,
} from "./session.ts";

void test("creates an opaque database session with the configured expiry", () => {
  const now = new Date("2026-09-09T00:00:00.000Z");
  const first = createSessionRecord("user_1", now);
  const second = createSessionRecord("user_1", now);

  assert.equal(first.userId, "user_1");
  assert.equal(
    first.expires.getTime(),
    now.getTime() + AUTH_SESSION_MAX_AGE_SECONDS * 1_000,
  );
  assert.notEqual(first.sessionToken, second.sessionToken);
  assert.ok(first.sessionToken.length >= 40);
});

void test("logout invalidates the current database session", async () => {
  let deletedToken: string | undefined;
  const ended = await endDatabaseSession("session-token", {
    deleteSession: (token) => {
      deletedToken = token;
      return Promise.resolve(1);
    },
  });

  assert.equal(ended, true);
  assert.equal(deletedToken, "session-token");
  assert.equal(await endDatabaseSession(undefined), false);
});

void test("uses HTTP-only secure cookies in production", () => {
  assert.equal(
    getAuthSessionCookieName("production"),
    "__Secure-authjs.session-token",
  );
  assert.deepEqual(getAuthSessionCookieOptions("production"), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: true,
  });
  assert.equal(getAuthSessionCookieOptions("development").secure, false);
});
