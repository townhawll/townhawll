import { expect, test } from "vitest";

import { signupSchema } from "./signup.ts";

test("signup input is normalized", () => {
  const result = signupSchema.parse({
    username: "  Town_User  ",
    email: "  USER@Example.COM ",
    password: "password",
  });

  expect(result.username).toBe("town_user");
  expect(result.email).toBe("user@example.com");
  expect(result.password).toBe("password");
});

test("signup rejects unsafe usernames and short passwords", () => {
  const result = signupSchema.safeParse({
    username: "town user",
    email: "user@example.com",
    password: "short",
  });

  expect(result.success).toBe(false);
});
