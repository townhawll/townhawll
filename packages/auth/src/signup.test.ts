import assert from "node:assert/strict";
import test from "node:test";

import { signupSchema } from "./signup.ts";

void test("signup input is normalized", () => {
  const result = signupSchema.parse({
    username: "  Town_User  ",
    email: "  USER@Example.COM ",
    password: "password",
  });

  assert.equal(result.username, "town_user");
  assert.equal(result.email, "user@example.com");
  assert.equal(result.password, "password");
});

void test("signup rejects unsafe usernames and short passwords", () => {
  const result = signupSchema.safeParse({
    username: "town user",
    email: "user@example.com",
    password: "short",
  });

  assert.equal(result.success, false);
});
