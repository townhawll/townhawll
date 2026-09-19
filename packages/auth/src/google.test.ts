import assert from "node:assert/strict";
import test from "node:test";
import type { Adapter, AdapterUser } from "next-auth/adapters";

import {
  createExistingUserOnlyGoogleAuthAdapter,
  createGoogleAuthAdapter,
  getAdminGoogleSignInDecision,
  getGoogleSignInDecision,
  parseVerifiedGoogleProfile,
} from "./google.ts";

const verifiedProfile = {
  email: " User@Gmail.com ",
  email_verified: true,
  sub: "google-account-1",
};

function createRepository(input?: {
  accountStatus?: "ACTIVE" | "BANNED" | "RESTRICTED" | "SUSPENDED";
  emailStatus?: "ACTIVE" | "BANNED" | "RESTRICTED" | "SUSPENDED";
}) {
  return {
    findByEmail: () =>
      Promise.resolve(
        input?.emailStatus
          ? { id: "email-user", status: input.emailStatus }
          : null,
      ),
    findByProviderAccountId: () =>
      Promise.resolve(
        input?.accountStatus
          ? { id: "google-user", status: input.accountStatus }
          : null,
      ),
  };
}

function createAdminRepository(input?: {
  account?: {
    roles: ("ADMIN" | "MODERATOR" | "OWNER")[];
    status: "ACTIVE" | "BANNED" | "DELETED" | "RESTRICTED" | "SUSPENDED";
  };
  email?: {
    roles: ("ADMIN" | "MODERATOR" | "OWNER")[];
    status: "ACTIVE" | "BANNED" | "DELETED" | "RESTRICTED" | "SUSPENDED";
  };
}) {
  return {
    findByEmail: () =>
      Promise.resolve(
        input?.email ? { id: "email-user", ...input.email } : null,
      ),
    findByProviderAccountId: () =>
      Promise.resolve(
        input?.account ? { id: "google-user", ...input.account } : null,
      ),
  };
}

void test("accepts only a verified Google email profile", () => {
  assert.deepEqual(parseVerifiedGoogleProfile(verifiedProfile), {
    email: "user@gmail.com",
    email_verified: true,
    sub: "google-account-1",
  });
  assert.equal(
    parseVerifiedGoogleProfile({ ...verifiedProfile, email_verified: false }),
    null,
  );
});

void test("allows a verified new Google user", async () => {
  assert.deepEqual(
    await getGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      { repository: createRepository() },
    ),
    { allowed: true, flow: "new" },
  );
});

void test("allows a returning Google account", async () => {
  assert.deepEqual(
    await getGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      { repository: createRepository({ accountStatus: "ACTIVE" }) },
    ),
    { allowed: true, flow: "returning" },
  );
});

void test("allows safe linking to an existing same-email account", async () => {
  assert.deepEqual(
    await getGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      { repository: createRepository({ emailStatus: "ACTIVE" }) },
    ),
    { allowed: true, flow: "link" },
  );
});

void test("rejects Google sign-in for unavailable accounts", async () => {
  assert.deepEqual(
    await getGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      { repository: createRepository({ accountStatus: "BANNED" }) },
    ),
    { allowed: false },
  );
});

void test("admin Google login allows an existing active staff account", async () => {
  assert.deepEqual(
    await getAdminGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      {
        repository: createAdminRepository({
          account: { roles: ["ADMIN"], status: "ACTIVE" },
        }),
      },
    ),
    {
      access: "staff",
      allowed: true,
      flow: "returning",
      userId: "google-user",
    },
  );
});

void test("admin Google login never accepts an unknown TownHawll user", async () => {
  assert.deepEqual(
    await getAdminGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      { repository: createAdminRepository() },
    ),
    { allowed: false },
  );
});

void test("admin Google login identifies an existing non-staff account", async () => {
  assert.deepEqual(
    await getAdminGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      {
        repository: createAdminRepository({
          email: { roles: [], status: "ACTIVE" },
        }),
      },
    ),
    {
      access: "non-staff",
      allowed: true,
      flow: "link",
      userId: "email-user",
    },
  );
});

void test("admin Google login rejects every inactive account state", async () => {
  for (const status of [
    "RESTRICTED",
    "SUSPENDED",
    "BANNED",
    "DELETED",
  ] as const) {
    assert.deepEqual(
      await getAdminGoogleSignInDecision(
        { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
        {
          repository: createAdminRepository({
            account: { roles: ["OWNER"], status },
          }),
        },
      ),
      { allowed: false },
    );
  }
});

void test("the admin Google adapter cannot create users or assign roles", () => {
  let delegatedCreation = false;
  const adapter = createExistingUserOnlyGoogleAuthAdapter({
    createUser(user) {
      delegatedCreation = true;
      return Promise.resolve(user);
    },
  });

  if (!adapter.createUser) assert.fail("Expected createUser adapter method.");
  assert.throws(() =>
    adapter.createUser!({
      email: "unknown@gmail.com",
      emailVerified: null,
      id: "new-user",
      image: null,
      name: "Unknown",
      status: "ACTIVE",
    }),
  );
  assert.equal(delegatedCreation, false);
});

void test("marks users created through the Google adapter as verified", async () => {
  const verifiedAt = new Date("2026-09-10T00:00:00.000Z");
  let createdUser: AdapterUser | undefined;
  const adapter: Adapter = {
    createUser(user) {
      createdUser = user;
      return Promise.resolve(createdUser);
    },
  };
  const googleAdapter = createGoogleAuthAdapter(adapter, () => verifiedAt);

  if (!googleAdapter.createUser)
    assert.fail("Expected createUser adapter method.");
  await googleAdapter.createUser({
    email: "user@gmail.com",
    emailVerified: null,
    id: "user_1",
    image: null,
    name: "User",
    status: "ACTIVE",
  });

  assert.equal(createdUser?.emailVerified, verifiedAt);
});
