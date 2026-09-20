import { expect, test } from "vitest";

import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  createSessionRecord,
  endDatabaseSession,
  getAuthSessionCookieName,
  getAuthSessionCookieOptions,
} from "./session.ts";

test("creates an opaque database session with the configured expiry", () => {
  const now = new Date("2026-09-09T00:00:00.000Z");
  const first = createSessionRecord("user_1", now);
  const second = createSessionRecord("user_1", now);

  expect(first.userId).toBe("user_1");
  expect(first.expires.getTime()).toBe(
    now.getTime() + AUTH_SESSION_MAX_AGE_SECONDS * 1_000,
  );
  expect(first.sessionToken).not.toBe(second.sessionToken);
  expect(first.sessionToken.length >= 40).toBeTruthy();
});

test("logout invalidates the current database session", async () => {
  let deletedToken: string | undefined;
  const ended = await endDatabaseSession("session-token", {
    deleteSession: (token) => {
      deletedToken = token;
      return Promise.resolve(1);
    },
  });

  expect(ended).toBe(true);
  expect(deletedToken).toBe("session-token");
  expect(await endDatabaseSession(undefined)).toBe(false);
});

test("uses HTTP-only secure cookies in production", () => {
  expect(getAuthSessionCookieName("production")).toBe(
    "__Secure-authjs.session-token",
  );
  expect(getAuthSessionCookieOptions("production")).toStrictEqual({
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: true,
  });
  expect(getAuthSessionCookieOptions("development").secure).toBe(false);
});
