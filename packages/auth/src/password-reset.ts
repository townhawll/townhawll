import { takeRateLimit } from "@townhawll/cache";
import { z } from "zod";

import { normalizeEmail } from "./account.ts";
import { hashPassword } from "./password.ts";
import {
  createAuthToken,
  hashAuthToken,
  type AuthTokenPair,
} from "./tokens.ts";

const PASSWORD_RESET_TOKEN_LIFETIME_MS = 60 * 60 * 1_000;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, "Enter a valid email address.")
    .email("Enter a valid email address.")
    .transform(normalizeEmail),
});

export const resetPasswordSchema = z
  .object({
    confirmPassword: z
      .string()
      .min(1, "Confirm your new password.")
      .max(128, "Password must contain at most 128 characters."),
    password: z
      .string()
      .min(8, "Password must contain at least 8 characters.")
      .max(128, "Password must contain at most 128 characters."),
    token: z.string().min(20).max(256),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type PasswordResetTokenStatus = "valid" | "expired" | "invalid";
export type PasswordResetResult =
  | { status: "reset"; revokedSessions: number }
  | { status: "expired" | "invalid" };

interface ResettableUser {
  email: string;
  id: string;
}

interface StoredPasswordResetToken {
  expiresAt: Date;
  id: string;
  usedAt: Date | null;
  userId: string;
}

interface PasswordResetRepository {
  consumeToken(input: {
    passwordHash: string;
    tokenId: string;
    userId: string;
    usedAt: Date;
  }): Promise<{ consumed: boolean; revokedSessions: number }>;
  deleteExpiredToken(tokenId: string): Promise<void>;
  findResettableUser(email: string): Promise<ResettableUser | null>;
  findToken(tokenHash: string): Promise<StoredPasswordResetToken | null>;
  replaceToken(input: {
    expiresAt: Date;
    tokenHash: string;
    userId: string;
  }): Promise<void>;
}

interface PasswordResetDependencies {
  createToken(): AuthTokenPair;
  hashNewPassword(password: string): Promise<string>;
  now(): Date;
  repository: PasswordResetRepository;
}

const prismaPasswordResetRepository: PasswordResetRepository = {
  async consumeToken(input) {
    const { db } = await import("@townhawll/db");
    return db.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetToken.updateMany({
        where: {
          expiresAt: { gt: input.usedAt },
          id: input.tokenId,
          usedAt: null,
        },
        data: { usedAt: input.usedAt },
      });

      if (consumed.count !== 1) {
        return { consumed: false, revokedSessions: 0 };
      }

      await transaction.user.update({
        where: { id: input.userId },
        data: { passwordHash: input.passwordHash },
      });
      const revokedSessions = await transaction.session.deleteMany({
        where: { userId: input.userId },
      });
      await transaction.passwordResetToken.deleteMany({
        where: {
          id: { not: input.tokenId },
          usedAt: null,
          userId: input.userId,
        },
      });

      return { consumed: true, revokedSessions: revokedSessions.count };
    });
  },
  async deleteExpiredToken(tokenId) {
    const { db } = await import("@townhawll/db");
    await db.passwordResetToken.deleteMany({ where: { id: tokenId } });
  },
  async findResettableUser(email) {
    const { db } = await import("@townhawll/db");
    return db.user.findFirst({
      where: {
        email,
        emailVerified: { not: null },
        passwordHash: { not: null },
        status: { in: ["ACTIVE", "RESTRICTED"] },
      },
      select: { email: true, id: true },
    });
  },
  async findToken(tokenHash) {
    const { db } = await import("@townhawll/db");
    return db.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { expiresAt: true, id: true, usedAt: true, userId: true },
    });
  },
  async replaceToken(input) {
    const { db } = await import("@townhawll/db");
    await db.$transaction(async (transaction) => {
      await transaction.passwordResetToken.deleteMany({
        where: { userId: input.userId, usedAt: null },
      });
      await transaction.passwordResetToken.create({
        data: {
          expiresAt: input.expiresAt,
          tokenHash: input.tokenHash,
          userId: input.userId,
        },
      });
    });
  },
};

const defaultDependencies: PasswordResetDependencies = {
  createToken: createAuthToken,
  hashNewPassword: hashPassword,
  now: () => new Date(),
  repository: prismaPasswordResetRepository,
};

export async function createPasswordResetRequest(
  input: ForgotPasswordInput,
  dependencies: PasswordResetDependencies = defaultDependencies,
): Promise<{ email: string; token: string; tokenHash: string } | null> {
  const { email } = forgotPasswordSchema.parse(input);
  const user = await dependencies.repository.findResettableUser(email);
  if (!user) return null;

  const tokenPair = dependencies.createToken();
  await dependencies.repository.replaceToken({
    expiresAt: new Date(
      dependencies.now().getTime() + PASSWORD_RESET_TOKEN_LIFETIME_MS,
    ),
    tokenHash: tokenPair.tokenHash,
    userId: user.id,
  });

  return { email: user.email, ...tokenPair };
}

export async function getPasswordResetTokenStatus(
  token: string,
  dependencies: PasswordResetDependencies = defaultDependencies,
): Promise<PasswordResetTokenStatus> {
  if (token.length < 20 || token.length > 256) return "invalid";

  const storedToken = await dependencies.repository.findToken(
    hashAuthToken(token),
  );
  if (!storedToken || storedToken.usedAt !== null) return "invalid";

  if (storedToken.expiresAt <= dependencies.now()) {
    await dependencies.repository.deleteExpiredToken(storedToken.id);
    return "expired";
  }

  return "valid";
}

export async function resetPassword(
  input: ResetPasswordInput,
  dependencies: PasswordResetDependencies = defaultDependencies,
): Promise<PasswordResetResult> {
  const parsedInput = resetPasswordSchema.parse(input);
  const storedToken = await dependencies.repository.findToken(
    hashAuthToken(parsedInput.token),
  );
  if (!storedToken || storedToken.usedAt !== null) return { status: "invalid" };

  const now = dependencies.now();
  if (storedToken.expiresAt <= now) {
    await dependencies.repository.deleteExpiredToken(storedToken.id);
    return { status: "expired" };
  }

  const passwordHash = await dependencies.hashNewPassword(parsedInput.password);
  const result = await dependencies.repository.consumeToken({
    passwordHash,
    tokenId: storedToken.id,
    userId: storedToken.userId,
    usedAt: now,
  });

  return result.consumed
    ? { status: "reset", revokedSessions: result.revokedSessions }
    : { status: "invalid" };
}

export async function allowPasswordResetRequest(input: {
  email: string;
  ipAddress: string;
}): Promise<boolean> {
  const email = normalizeEmail(input.email);
  const [ipLimit, emailLimit] = await Promise.all([
    takeRateLimit({
      namespace: "password-reset-request:ip",
      signal: input.ipAddress,
      limit: 10,
      windowSeconds: 60 * 60,
    }),
    takeRateLimit({
      namespace: "password-reset-request:email",
      signal: email,
      limit: 3,
      windowSeconds: 60 * 60,
    }),
  ]);

  return ipLimit.allowed && emailLimit.allowed;
}

export async function allowPasswordResetAttempt(input: {
  ipAddress: string;
  token: string;
}): Promise<boolean> {
  const [ipLimit, tokenLimit] = await Promise.all([
    takeRateLimit({
      namespace: "password-reset:ip",
      signal: input.ipAddress,
      limit: 15,
      windowSeconds: 15 * 60,
    }),
    takeRateLimit({
      namespace: "password-reset:token",
      signal: input.token,
      limit: 5,
      windowSeconds: 15 * 60,
    }),
  ]);

  return ipLimit.allowed && tokenLimit.allowed;
}
