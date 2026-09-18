import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublicProfilePath,
  getPublicProfileByUsername,
  isCanonicalProfileUsername,
  isProfileOwner,
  type PublicProfileRepository,
} from "./public-profile.ts";

const record = {
  userId: "user_1",
  username: "town_user",
  displayName: "Town User",
  avatarUrl: "https://images.example.com/avatar.png",
  bio: "Games and films.",
  user: { createdAt: new Date("2026-09-01T00:00:00.000Z") },
};

void test("public profile lookup normalizes username input", async () => {
  let lookup = "";
  const repository: PublicProfileRepository = {
    findByUsername(username) {
      lookup = username;
      return Promise.resolve(record);
    },
  };

  const profile = await getPublicProfileByUsername("  ToWn_UsEr ", repository);
  assert.equal(lookup, "town_user");
  assert.equal(profile?.username, "town_user");
});

void test("invalid and missing usernames do not produce public profiles", async () => {
  let lookupCount = 0;
  const repository: PublicProfileRepository = {
    findByUsername() {
      lookupCount += 1;
      return Promise.resolve(null);
    },
  };

  assert.equal(
    await getPublicProfileByUsername("not-valid!", repository),
    null,
  );
  assert.equal(lookupCount, 0);
  assert.equal(await getPublicProfileByUsername("missing", repository), null);
  assert.equal(lookupCount, 1);
});

void test("public profile mapping exposes only approved identity fields", async () => {
  const repository: PublicProfileRepository = {
    findByUsername() {
      return Promise.resolve({
        ...record,
        email: "private@example.com",
        status: "ACTIVE",
      });
    },
  };

  const profile = await getPublicProfileByUsername("town_user", repository);
  assert.deepEqual(profile, {
    userId: "user_1",
    username: "town_user",
    displayName: "Town User",
    avatarUrl: "https://images.example.com/avatar.png",
    bio: "Games and films.",
    joinedAt: new Date("2026-09-01T00:00:00.000Z"),
  });
  assert.equal("email" in (profile ?? {}), false);
  assert.equal("status" in (profile ?? {}), false);
});

void test("canonical usernames and profile ownership use exact stored identity", () => {
  assert.equal(isCanonicalProfileUsername("town_user", "town_user"), true);
  assert.equal(isCanonicalProfileUsername("Town_User", "town_user"), false);
  assert.equal(isProfileOwner("user_1", "user_1"), true);
  assert.equal(isProfileOwner("user_1", "user_2"), false);
  assert.equal(isProfileOwner("user_1", null), false);
});

void test("public profile paths use the canonical username", () => {
  assert.equal(getPublicProfilePath("player_one"), "/u/player_one");
});
