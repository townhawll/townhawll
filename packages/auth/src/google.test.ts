import assert from "node:assert/strict";
import test from "node:test";
import type { Adapter, AdapterUser } from "next-auth/adapters";

import {
  createGoogleAuthAdapter,
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
    username: null,
  });

  assert.equal(createdUser?.emailVerified, verifiedAt);
});
