import { takeRateLimit } from "@townhawll/cache";
import type { AccountStatus } from "@townhawll/db";
import { z } from "zod";

import { findUserByIdentifier } from "./account.ts";
import { verifyPassword } from "./password.ts";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$5NtnoEdmLB4n5V3qktBtvA$ZGc/Jt9AWuwYrRCXLbdUV7HGPhCqfofeP3In51o6gy0";

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "Enter your username or email address.")
    .max(254, "Enter a valid username or email address.")
    .transform((value) => value.normalize("NFKC").toLowerCase()),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(128, "Password must contain at most 128 characters."),
});

export type LoginInput = z.infer<typeof loginSchema>;

interface PasswordUser {
  email: string;
  emailVerified: Date | null;
  id: string;
  name: string | null;
  passwordHash: string | null;
  status: AccountStatus;
  username: string | null;
}

export type PasswordAuthenticationResult =
  | { status: "authenticated"; user: Omit<PasswordUser, "passwordHash"> }
  | { status: "invalid" }
  | { status: "unavailable" }
  | { status: "unverified"; email: string };

interface PasswordAuthenticationDependencies {
  findUser(identifier: string): Promise<PasswordUser | null>;
  verify(hash: string, password: string): Promise<boolean>;
}

const defaultDependencies: PasswordAuthenticationDependencies = {
  findUser: findUserByIdentifier,
  verify: verifyPassword,
};

export async function authenticatePasswordUser(
  input: LoginInput,
  dependencies: PasswordAuthenticationDependencies = defaultDependencies,
): Promise<PasswordAuthenticationResult> {
  const parsedInput = loginSchema.parse(input);
  const user = await dependencies.findUser(parsedInput.identifier);
  const passwordMatches = await dependencies.verify(
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    parsedInput.password,
  );

  if (!user || !user.passwordHash || !passwordMatches) {
    return { status: "invalid" };
  }

  if (user.emailVerified === null) {
    return { status: "unverified", email: user.email };
  }

  if (
    user.status === "SUSPENDED" ||
    user.status === "BANNED" ||
    user.status === "DELETED"
  ) {
    return { status: "unavailable" };
  }

  return {
    status: "authenticated",
    user: {
      email: user.email,
      emailVerified: user.emailVerified,
      id: user.id,
      name: user.name,
      status: user.status,
      username: user.username,
    },
  };
}

export async function allowLogin(input: {
  identifier: string;
  ipAddress: string;
}): Promise<boolean> {
  const identifier = input.identifier.trim().normalize("NFKC").toLowerCase();
  const [ipLimit, identifierLimit] = await Promise.all([
    takeRateLimit({
      namespace: "login:ip",
      signal: input.ipAddress,
      limit: 20,
      windowSeconds: 15 * 60,
    }),
    takeRateLimit({
      namespace: "login:identifier",
      signal: identifier,
      limit: 8,
      windowSeconds: 15 * 60,
    }),
  ]);

  return ipLimit.allowed && identifierLimit.allowed;
}
