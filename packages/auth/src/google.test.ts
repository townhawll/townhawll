import { expect, test } from "vitest";
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

test("accepts only a verified Google email profile", () => {
  expect(parseVerifiedGoogleProfile(verifiedProfile)).toStrictEqual({
    email: "user@gmail.com",
    email_verified: true,
    sub: "google-account-1",
  });
  expect(
    parseVerifiedGoogleProfile({ ...verifiedProfile, email_verified: false }),
  ).toBe(null);
});

test("allows a verified new Google user", async () => {
  expect(
    await getGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      { repository: createRepository() },
    ),
  ).toStrictEqual({ allowed: true, flow: "new" });
});

test("allows a returning Google account", async () => {
  expect(
    await getGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      { repository: createRepository({ accountStatus: "ACTIVE" }) },
    ),
  ).toStrictEqual({ allowed: true, flow: "returning" });
});

test("allows safe linking to an existing same-email account", async () => {
  expect(
    await getGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      { repository: createRepository({ emailStatus: "ACTIVE" }) },
    ),
  ).toStrictEqual({ allowed: true, flow: "link" });
});

test("rejects Google sign-in for unavailable accounts", async () => {
  expect(
    await getGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      { repository: createRepository({ accountStatus: "BANNED" }) },
    ),
  ).toStrictEqual({ allowed: false });
});

test("admin Google login allows an existing active staff account", async () => {
  expect(
    await getAdminGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      {
        repository: createAdminRepository({
          account: { roles: ["ADMIN"], status: "ACTIVE" },
        }),
      },
    ),
  ).toStrictEqual({
    access: "staff",
    allowed: true,
    flow: "returning",
    userId: "google-user",
  });
});

test("admin Google login safely links an existing active staff email", async () => {
  expect(
    await getAdminGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      {
        repository: createAdminRepository({
          email: { roles: ["MODERATOR"], status: "ACTIVE" },
        }),
      },
    ),
  ).toStrictEqual({
    access: "staff",
    allowed: true,
    flow: "link",
    userId: "email-user",
  });
});

test("admin Google login never accepts an unknown TownHawll user", async () => {
  expect(
    await getAdminGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      { repository: createAdminRepository() },
    ),
  ).toStrictEqual({ allowed: false });
});

test("admin Google login identifies an existing non-staff account", async () => {
  expect(
    await getAdminGoogleSignInDecision(
      { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
      {
        repository: createAdminRepository({
          email: { roles: [], status: "ACTIVE" },
        }),
      },
    ),
  ).toStrictEqual({
    access: "non-staff",
    allowed: true,
    flow: "link",
    userId: "email-user",
  });
});

test("admin Google login rejects every inactive account state", async () => {
  for (const status of [
    "RESTRICTED",
    "SUSPENDED",
    "BANNED",
    "DELETED",
  ] as const) {
    expect(
      await getAdminGoogleSignInDecision(
        { profile: verifiedProfile, providerAccountId: verifiedProfile.sub },
        {
          repository: createAdminRepository({
            account: { roles: ["OWNER"], status },
          }),
        },
      ),
    ).toStrictEqual({ allowed: false });
  }
});

test("the admin Google adapter cannot create users or assign roles", () => {
  let delegatedCreation = false;
  const adapter = createExistingUserOnlyGoogleAuthAdapter({
    createUser(user) {
      delegatedCreation = true;
      return Promise.resolve(user);
    },
  });

  if (!adapter.createUser)
    expect.unreachable("Expected createUser adapter method.");
  expect(() =>
    adapter.createUser!({
      email: "unknown@gmail.com",
      emailVerified: null,
      id: "new-user",
      image: null,
      name: "Unknown",
      status: "ACTIVE",
    }),
  ).toThrow();
  expect(delegatedCreation).toBe(false);
});

test("marks users created through the Google adapter as verified", async () => {
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
    expect.unreachable("Expected createUser adapter method.");
  await googleAdapter.createUser({
    email: "user@gmail.com",
    emailVerified: null,
    id: "user_1",
    image: null,
    name: "User",
    status: "ACTIVE",
  });

  expect(createdUser?.emailVerified).toBe(verifiedAt);
});
