import assert from "node:assert/strict";
import test from "node:test";

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

void test("creates a durable reset token for a known email", async () => {
  const harness = createHarness();
  const request = await createPasswordResetRequest(
    { email: " USER@Example.com " },
    harness.dependencies,
  );

  assert.equal(request?.email, "user@example.com");
  assert.equal(request?.token, RAW_TOKEN);
  assert.equal(request?.tokenHash, hashAuthToken(RAW_TOKEN));
  assert.notEqual(request?.tokenHash, request?.token);
});

void test("returns no reset details for an unknown email", async () => {
  const harness = createHarness({ hasUser: false });
  const request = await createPasswordResetRequest(
    { email: "unknown@example.com" },
    harness.dependencies,
  );

  assert.equal(request, null);
});

void test("reports invalid and expired reset tokens", async () => {
  const invalidHarness = createHarness();
  assert.equal(
    await getPasswordResetTokenStatus("invalid", invalidHarness.dependencies),
    "invalid",
  );

  const expiredHarness = createHarness({
    expiresAt: new Date(NOW.getTime() - 1),
  });
  await createPasswordResetRequest(
    { email: "user@example.com" },
    expiredHarness.dependencies,
  );
  assert.equal(
    await getPasswordResetTokenStatus(RAW_TOKEN, expiredHarness.dependencies),
    "expired",
  );
});

void test("resets the password once and revokes every existing session", async () => {
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

  assert.deepEqual(result, { revokedSessions: 3, status: "reset" });
  assert.equal(
    await verifyPassword(harness.getPasswordHash(), "old-password"),
    false,
  );
  assert.equal(
    await verifyPassword(harness.getPasswordHash(), "new-password"),
    true,
  );
  assert.equal(harness.getSessions(), 0);

  assert.deepEqual(
    await resetPassword(
      {
        confirmPassword: "another-password",
        password: "another-password",
        token: RAW_TOKEN,
      },
      harness.dependencies,
    ),
    { status: "invalid" },
  );
});
