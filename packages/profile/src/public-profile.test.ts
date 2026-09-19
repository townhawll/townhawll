import { expect, test } from "vitest";

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

test("public profile lookup normalizes username input", async () => {
  let lookup = "";
  const repository: PublicProfileRepository = {
    findByUsername(username) {
      lookup = username;
      return Promise.resolve(record);
    },
  };

  const profile = await getPublicProfileByUsername("  ToWn_UsEr ", repository);
  expect(lookup).toBe("town_user");
  expect(profile?.username).toBe("town_user");
});

test("invalid and missing usernames do not produce public profiles", async () => {
  let lookupCount = 0;
  const repository: PublicProfileRepository = {
    findByUsername() {
      lookupCount += 1;
      return Promise.resolve(null);
    },
  };

  expect(await getPublicProfileByUsername("not-valid!", repository)).toBe(null);
  expect(lookupCount).toBe(0);
  expect(await getPublicProfileByUsername("missing", repository)).toBe(null);
  expect(lookupCount).toBe(1);
});

test("public profile mapping exposes only approved identity fields", async () => {
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
  expect(profile).toStrictEqual({
    userId: "user_1",
    username: "town_user",
    displayName: "Town User",
    avatarUrl: "https://images.example.com/avatar.png",
    bio: "Games and films.",
    joinedAt: new Date("2026-09-01T00:00:00.000Z"),
  });
  expect("email" in (profile ?? {})).toBe(false);
  expect("status" in (profile ?? {})).toBe(false);
});

test("canonical usernames and profile ownership use exact stored identity", () => {
  expect(isCanonicalProfileUsername("town_user", "town_user")).toBe(true);
  expect(isCanonicalProfileUsername("Town_User", "town_user")).toBe(false);
  expect(isProfileOwner("user_1", "user_1")).toBe(true);
  expect(isProfileOwner("user_1", "user_2")).toBe(false);
  expect(isProfileOwner("user_1", null)).toBe(false);
});

test("public profile paths use the canonical username", () => {
  expect(getPublicProfilePath("player_one")).toBe("/u/player_one");
});
