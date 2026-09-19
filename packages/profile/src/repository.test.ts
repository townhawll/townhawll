import { expect, test } from "vitest";

import {
  type BasicProfileRepository,
  changeUsername,
  type UsernameChangeRepository,
  updateBasicProfile,
} from "./repository.ts";

function createDetailsRepository(options?: {
  updateResult?: boolean;
  updateError?: Error;
}) {
  const calls: Array<{
    userId: string;
    input: { displayName: string; bio: string };
  }> = [];
  const repository: BasicProfileRepository = {
    updateForUser(userId, input) {
      calls.push({ userId, input });
      if (options?.updateError) return Promise.reject(options.updateError);
      return Promise.resolve(options?.updateResult ?? true);
    },
  };
  return { calls, repository };
}

test("profile edits normalize values and target only the authenticated user", async () => {
  const { calls, repository } = createDetailsRepository();
  const result = await updateBasicProfile(
    "authenticated_user",
    { displayName: "  Player One  ", bio: "  Hello TownHawll  " },
    repository,
  );

  expect(result).toStrictEqual({ status: "saved" });
  expect(calls).toStrictEqual([
    {
      userId: "authenticated_user",
      input: { displayName: "Player One", bio: "Hello TownHawll" },
    },
  ]);
});

test("optional bio can be cleared", async () => {
  const { calls, repository } = createDetailsRepository();
  await updateBasicProfile(
    "user_1",
    { displayName: "Player", bio: "   " },
    repository,
  );
  expect(calls[0]?.input.bio).toBe("");
});

test("missing or incomplete profiles are not updated", async () => {
  const { repository } = createDetailsRepository({ updateResult: false });
  const result = await updateBasicProfile(
    "user_1",
    { displayName: "Player", bio: "" },
    repository,
  );
  expect(result).toStrictEqual({ status: "profile_missing" });
});

function createUsernameRepository(options?: {
  occupantId?: string;
  updateResult?: boolean;
  updateError?: Error;
}) {
  const calls: Array<{ userId: string; username: string }> = [];
  const repository: UsernameChangeRepository = {
    findByUsername() {
      return Promise.resolve(
        options?.occupantId ? { userId: options.occupantId } : null,
      );
    },
    updateUsername(userId, username) {
      calls.push({ userId, username });
      if (options?.updateError) return Promise.reject(options.updateError);
      return Promise.resolve(options?.updateResult ?? true);
    },
  };
  return { calls, repository };
}

test("username changes normalize before the dedicated mutation", async () => {
  const { calls, repository } = createUsernameRepository();
  const result = await changeUsername(
    "authenticated_user",
    "  Player_One  ",
    repository,
  );

  expect(result).toStrictEqual({ status: "changed", username: "player_one" });
  expect(calls).toStrictEqual([
    { userId: "authenticated_user", username: "player_one" },
  ]);
});

test("another user's username cannot be claimed", async () => {
  const { calls, repository } = createUsernameRepository({
    occupantId: "user_2",
  });
  const result = await changeUsername("user_1", "player_two", repository);
  expect(result).toStrictEqual({ status: "username_taken" });
  expect(calls.length).toBe(0);
});

test("invalid usernames are rejected before persistence", async () => {
  const { calls, repository } = createUsernameRepository();
  await expect(changeUsername("user_1", "admin", repository)).rejects.toThrow(
    /reserved/i,
  );
  expect(calls.length).toBe(0);
});

test("a unique-constraint race becomes a safe username result", async () => {
  const conflict = Object.assign(new Error("Unique constraint failed."), {
    code: "P2002",
  });
  const { repository } = createUsernameRepository({
    updateError: conflict,
  });
  const result = await changeUsername("user_1", "player_one", repository);
  expect(result).toStrictEqual({ status: "username_taken" });
});
