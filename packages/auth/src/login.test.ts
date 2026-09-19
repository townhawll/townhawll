import { expect, test } from "vitest";

import {
  authenticatePasswordUser,
  emailPasswordLoginSchema,
  loginSchema,
} from "./login.ts";
import { resolveStaffAccess } from "./staff-context.ts";

const verifiedUser = {
  email: "user@example.com",
  emailVerified: new Date("2026-09-09T00:00:00.000Z"),
  id: "user_1",
  name: null,
  passwordHash: "stored-password-hash",
  status: "ACTIVE" as const,
  username: "town_user",
};

test("login input normalizes an email or username", () => {
  const result = loginSchema.parse({
    identifier: "  Town_User  ",
    password: "password",
  });

  expect(result.identifier).toBe("town_user");
});

test("email login accepts normalized email and rejects usernames", () => {
  expect(
    emailPasswordLoginSchema.parse({
      email: "  Staff@Example.com  ",
      password: "password",
    }),
  ).toStrictEqual({ email: "staff@example.com", password: "password" });
  expect(
    emailPasswordLoginSchema.safeParse({
      email: "staff_username",
      password: "password",
    }).success,
  ).toBe(false);
});

test("authenticates a verified user with a valid password", async () => {
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

  expect(result.status).toBe("authenticated");
  if (result.status === "authenticated") {
    expect(result.user.id).toBe(verifiedUser.id);
    expect("passwordHash" in result.user).toBe(false);
  }
});

test("an existing password-based staff account remains admin eligible", async () => {
  const result = await authenticatePasswordUser(
    { identifier: "user@example.com", password: "correct-password" },
    {
      findUser: () => Promise.resolve(verifiedUser),
      verify: () => Promise.resolve(true),
    },
  );

  expect(result.status).toBe("authenticated");
  if (result.status === "authenticated") {
    expect(
      resolveStaffAccess({ ...result.user, roles: ["ADMIN"] }).status,
    ).toBe("authorized");
  }
});

test("rejects an invalid password with the generic invalid result", async () => {
  const result = await authenticatePasswordUser(
    { identifier: "town_user", password: "wrong-password" },
    {
      findUser: () => Promise.resolve(verifiedUser),
      verify: () => Promise.resolve(false),
    },
  );

  expect(result).toStrictEqual({ status: "invalid" });
});

test("rejects an unknown user after performing a password check", async () => {
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

  expect(passwordChecked).toBe(true);
  expect(result).toStrictEqual({ status: "invalid" });
});

test("requires verification after the correct password", async () => {
  const result = await authenticatePasswordUser(
    { identifier: "town_user", password: "correct-password" },
    {
      findUser: () => Promise.resolve({ ...verifiedUser, emailVerified: null }),
      verify: () => Promise.resolve(true),
    },
  );

  expect(result).toStrictEqual({
    email: verifiedUser.email,
    status: "unverified",
  });
});

test("blocks unavailable accounts after the correct password", async () => {
  const result = await authenticatePasswordUser(
    { identifier: "town_user", password: "correct-password" },
    {
      findUser: () => Promise.resolve({ ...verifiedUser, status: "SUSPENDED" }),
      verify: () => Promise.resolve(true),
    },
  );

  expect(result).toStrictEqual({ status: "unavailable" });
});
