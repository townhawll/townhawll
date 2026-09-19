import { expect, test } from "vitest";

import { hashPassword, verifyPassword } from "./password.ts";
import {
  createPasswordResetRequest,
  getPasswordResetTokenStatus,
  resetPassword,
} from "./password-reset.ts";
import { hashAuthToken } from "./tokens.ts";

const NOW = new Date("2026-09-10T00:00:00.000Z");
const RAW_TOKEN = "a".repeat(43);

function createHarness(options?: {
  expiresAt?: Date;
  hasUser?: boolean;
  usedAt?: Date | null;
}) {
  let passwordHash = "old-password-hash";
  let sessions = 3;
  let token:
    | {
        expiresAt: Date;
        id: string;
        tokenHash: string;
        usedAt: Date | null;
        userId: string;
      }
    | undefined;

  const repository = {
    consumeToken(input: {
      passwordHash: string;
      tokenId: string;
      userId: string;
      usedAt: Date;
    }) {
      if (
        !token ||
        token.id !== input.tokenId ||
        token.userId !== input.userId ||
        token.usedAt !== null ||
        token.expiresAt <= input.usedAt
      ) {
        return Promise.resolve({ consumed: false, revokedSessions: 0 });
      }

      token.usedAt = input.usedAt;
      passwordHash = input.passwordHash;
      const revokedSessions = sessions;
      sessions = 0;
      return Promise.resolve({ consumed: true, revokedSessions });
    },
    deleteExpiredToken(tokenId: string) {
      if (token?.id === tokenId) token = undefined;
      return Promise.resolve();
    },
    findResettableUser() {
      return Promise.resolve(
        options?.hasUser === false
          ? null
          : { email: "user@example.com", id: "user_1" },
      );
    },
    findToken(tokenHash: string) {
      return Promise.resolve(
        token?.tokenHash === tokenHash
          ? {
              expiresAt: token.expiresAt,
              id: token.id,
              usedAt: token.usedAt,
              userId: token.userId,
            }
          : null,
      );
    },
    replaceToken(input: {
      expiresAt: Date;
      tokenHash: string;
      userId: string;
    }) {
      token = {
        ...input,
        expiresAt: options?.expiresAt ?? input.expiresAt,
        id: "reset_1",
        usedAt: options?.usedAt ?? null,
      };
      return Promise.resolve();
    },
  };

  return {
    dependencies: {
      createToken: () => ({
        token: RAW_TOKEN,
        tokenHash: hashAuthToken(RAW_TOKEN),
      }),
      hashNewPassword: hashPassword,
      now: () => NOW,
      repository,
    },
    getPasswordHash: () => passwordHash,
    getSessions: () => sessions,
  };
}

test("creates a durable reset token for a known email", async () => {
  const harness = createHarness();
  const request = await createPasswordResetRequest(
    { email: " USER@Example.com " },
    harness.dependencies,
  );

  expect(request?.email).toBe("user@example.com");
  expect(request?.token).toBe(RAW_TOKEN);
  expect(request?.tokenHash).toBe(hashAuthToken(RAW_TOKEN));
  expect(request?.tokenHash).not.toBe(request?.token);
});

test("returns no reset details for an unknown email", async () => {
  const harness = createHarness({ hasUser: false });
  const request = await createPasswordResetRequest(
    { email: "unknown@example.com" },
    harness.dependencies,
  );

  expect(request).toBe(null);
});

test("reports invalid and expired reset tokens", async () => {
  const invalidHarness = createHarness();
  expect(
    await getPasswordResetTokenStatus("invalid", invalidHarness.dependencies),
  ).toBe("invalid");

  const expiredHarness = createHarness({
    expiresAt: new Date(NOW.getTime() - 1),
  });
  await createPasswordResetRequest(
    { email: "user@example.com" },
    expiredHarness.dependencies,
  );
  expect(
    await getPasswordResetTokenStatus(RAW_TOKEN, expiredHarness.dependencies),
  ).toBe("expired");
});

test("resets the password once and revokes every existing session", async () => {
  const harness = createHarness();
  await createPasswordResetRequest(
    { email: "user@example.com" },
    harness.dependencies,
  );

  const result = await resetPassword(
    {
      confirmPassword: "new-password",
      password: "new-password",
      token: RAW_TOKEN,
    },
    harness.dependencies,
  );

  expect(result).toStrictEqual({ revokedSessions: 3, status: "reset" });
  expect(await verifyPassword(harness.getPasswordHash(), "old-password")).toBe(
    false,
  );
  expect(await verifyPassword(harness.getPasswordHash(), "new-password")).toBe(
    true,
  );
  expect(harness.getSessions()).toBe(0);

  expect(
    await resetPassword(
      {
        confirmPassword: "another-password",
        password: "another-password",
        token: RAW_TOKEN,
      },
      harness.dependencies,
    ),
  ).toStrictEqual({ status: "invalid" });
});
