import assert from "node:assert/strict";
import test from "node:test";

import { authenticatePasswordUser, loginSchema } from "./login.ts";

const verifiedUser = {
  email: "user@example.com",
  emailVerified: new Date("2026-09-09T00:00:00.000Z"),
  id: "user_1",
  name: null,
  passwordHash: "stored-password-hash",
  status: "ACTIVE" as const,
  username: "town_user",
};

void test("login input normalizes an email or username", () => {
  const result = loginSchema.parse({
    identifier: "  Town_User  ",
    password: "password",
  });

  assert.equal(result.identifier, "town_user");
});

void test("authenticates a verified user with a valid password", async () => {
  const result = await authenticatePasswordUser(
    { identifier: "town_user", password: "correct-password" },
    {
      findUser: () => Promise.resolve(verifiedUser),
      verify: (hash, password) =>
        Promise.resolve(
          hash === verifiedUser.passwordHash && password === "correct-password",
        ),
    },
  );

  assert.equal(result.status, "authenticated");
  if (result.status === "authenticated") {
    assert.equal(result.user.id, verifiedUser.id);
    assert.equal("passwordHash" in result.user, false);
  }
});

void test("rejects an invalid password with the generic invalid result", async () => {
  const result = await authenticatePasswordUser(
    { identifier: "town_user", password: "wrong-password" },
    {
      findUser: () => Promise.resolve(verifiedUser),
      verify: () => Promise.resolve(false),
    },
  );

  assert.deepEqual(result, { status: "invalid" });
});

void test("rejects an unknown user after performing a password check", async () => {
  let passwordChecked = false;
  const result = await authenticatePasswordUser(
    { identifier: "unknown", password: "wrong-password" },
    {
      findUser: () => Promise.resolve(null),
      verify: () => {
        passwordChecked = true;
        return Promise.resolve(false);
      },
    },
  );

  assert.equal(passwordChecked, true);
  assert.deepEqual(result, { status: "invalid" });
});

void test("requires verification after the correct password", async () => {
  const result = await authenticatePasswordUser(
    { identifier: "town_user", password: "correct-password" },
    {
      findUser: () => Promise.resolve({ ...verifiedUser, emailVerified: null }),
      verify: () => Promise.resolve(true),
    },
  );

  assert.deepEqual(result, {
    email: verifiedUser.email,
    status: "unverified",
  });
});

void test("blocks unavailable accounts after the correct password", async () => {
  const result = await authenticatePasswordUser(
    { identifier: "town_user", password: "correct-password" },
    {
      findUser: () => Promise.resolve({ ...verifiedUser, status: "SUSPENDED" }),
      verify: () => Promise.resolve(true),
    },
  );

  assert.deepEqual(result, { status: "unavailable" });
});
