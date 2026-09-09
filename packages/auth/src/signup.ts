import { takeRateLimit } from "@townhawll/cache";
import { z } from "zod";

import { normalizeEmail, normalizeUsername } from "./account.ts";
import { hashPassword } from "./password.ts";
import { createAuthToken, hashAuthToken } from "./tokens.ts";

const VERIFICATION_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1_000;

export const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must contain at least 3 characters.")
    .max(30, "Username must contain at most 30 characters.")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can contain only letters, numbers, and underscores.",
    )
    .transform(normalizeUsername),
  email: z
    .string()
    .trim()
    .max(254, "Enter a valid email address.")
    .email("Enter a valid email address.")
    .transform(normalizeEmail),
  password: z
    .string()
    .min(8, "Password must contain at least 8 characters.")
    .max(128, "Password must contain at most 128 characters."),
});

export const verificationResendSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, "Enter a valid email address.")
    .email("Enter a valid email address.")
    .transform(normalizeEmail),
});

export type SignupInput = z.infer<typeof signupSchema>;

export type RegistrationResult =
  | { status: "existing" }
  | {
      status: "created";
      email: string;
      token: string;
      tokenHash: string;
    };

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function registerPasswordUser(
  input: SignupInput,
): Promise<RegistrationResult> {
  const parsedInput = signupSchema.parse(input);
  const { db } = await import("@townhawll/db");
  const existingUser = await db.user.findFirst({
    where: {
      OR: [{ email: parsedInput.email }, { username: parsedInput.username }],
    },
    select: { id: true },
  });

  if (existingUser) {
    return { status: "existing" };
  }

  const passwordHash = await hashPassword(parsedInput.password);
  const tokenPair = createAuthToken();
  const expires = new Date(Date.now() + VERIFICATION_TOKEN_LIFETIME_MS);

  try {
    await db.$transaction(async (transaction) => {
      await transaction.user.create({
        data: {
          email: parsedInput.email,
          username: parsedInput.username,
          passwordHash,
        },
      });
      await transaction.verificationToken.create({
        data: {
          identifier: parsedInput.email,
          token: tokenPair.tokenHash,
          expires,
        },
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: "existing" };
    }

    throw error;
  }

  return {
    status: "created",
    email: parsedInput.email,
    token: tokenPair.token,
    tokenHash: tokenPair.tokenHash,
  };
}

export async function replaceVerificationToken(
  email: string,
): Promise<{ email: string; token: string; tokenHash: string } | null> {
  const normalizedEmail = normalizeEmail(email);
  const { db } = await import("@townhawll/db");
  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { email: true, emailVerified: true },
  });

  if (!user || user.emailVerified) {
    return null;
  }

  const tokenPair = createAuthToken();
  const expires = new Date(Date.now() + VERIFICATION_TOKEN_LIFETIME_MS);

  await db.$transaction(async (transaction) => {
    await transaction.verificationToken.deleteMany({
      where: { identifier: user.email },
    });
    await transaction.verificationToken.create({
      data: {
        identifier: user.email,
        token: tokenPair.tokenHash,
        expires,
      },
    });
  });

  return {
    email: user.email,
    token: tokenPair.token,
    tokenHash: tokenPair.tokenHash,
  };
}

export type EmailVerificationResult = "verified" | "expired" | "invalid";

export async function verifyEmailToken(
  token: string,
): Promise<EmailVerificationResult> {
  if (token.length < 20 || token.length > 256) {
    return "invalid";
  }

  const tokenHash = hashAuthToken(token);
  const { db } = await import("@townhawll/db");
  const storedToken = await db.verificationToken.findUnique({
    where: { token: tokenHash },
  });

  if (!storedToken) {
    return "invalid";
  }

  if (storedToken.expires <= new Date()) {
    await db.verificationToken.deleteMany({ where: { token: tokenHash } });
    return "expired";
  }

  return db.$transaction(async (transaction) => {
    const consumed = await transaction.verificationToken.deleteMany({
      where: { token: tokenHash },
    });

    if (consumed.count !== 1) {
      return "invalid";
    }

    const verified = await transaction.user.updateMany({
      where: { email: storedToken.identifier },
      data: { emailVerified: new Date() },
    });

    return verified.count === 1 ? "verified" : "invalid";
  });
}

export async function allowSignup(input: {
  ipAddress: string;
  email: string;
}): Promise<boolean> {
  const email = normalizeEmail(input.email);
  const [ipLimit, emailLimit] = await Promise.all([
    takeRateLimit({
      namespace: "signup:ip",
      signal: input.ipAddress,
      limit: 10,
      windowSeconds: 15 * 60,
    }),
    takeRateLimit({
      namespace: "signup:email",
      signal: email,
      limit: 3,
      windowSeconds: 60 * 60,
    }),
  ]);

  return ipLimit.allowed && emailLimit.allowed;
}

export async function allowVerificationResend(input: {
  ipAddress: string;
  email: string;
}): Promise<boolean> {
  const email = normalizeEmail(input.email);
  const [ipLimit, emailLimit] = await Promise.all([
    takeRateLimit({
      namespace: "verification-resend:ip",
      signal: input.ipAddress,
      limit: 10,
      windowSeconds: 60 * 60,
    }),
    takeRateLimit({
      namespace: "verification-resend:email",
      signal: email,
      limit: 3,
      windowSeconds: 60 * 60,
    }),
  ]);

  return ipLimit.allowed && emailLimit.allowed;
}
