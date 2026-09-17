import assert from "node:assert/strict";
import test from "node:test";

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

void test("profile edits normalize values and target only the authenticated user", async () => {
  const { calls, repository } = createDetailsRepository();
  const result = await updateBasicProfile(
    "authenticated_user",
    { displayName: "  Player One  ", bio: "  Hello TownHawll  " },
    repository,
  );

  assert.deepEqual(result, { status: "saved" });
  assert.deepEqual(calls, [
    {
      userId: "authenticated_user",
      input: { displayName: "Player One", bio: "Hello TownHawll" },
    },
  ]);
});

void test("optional bio can be cleared", async () => {
  const { calls, repository } = createDetailsRepository();
  await updateBasicProfile(
    "user_1",
    { displayName: "Player", bio: "   " },
    repository,
  );
  assert.equal(calls[0]?.input.bio, "");
});

void test("missing or incomplete profiles are not updated", async () => {
  const { repository } = createDetailsRepository({ updateResult: false });
  const result = await updateBasicProfile(
    "user_1",
    { displayName: "Player", bio: "" },
    repository,
  );
  assert.deepEqual(result, { status: "profile_missing" });
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

void test("username changes normalize before the dedicated mutation", async () => {
  const { calls, repository } = createUsernameRepository();
  const result = await changeUsername(
    "authenticated_user",
    "  Player_One  ",
    repository,
  );

  assert.deepEqual(result, { status: "changed", username: "player_one" });
  assert.deepEqual(calls, [
    { userId: "authenticated_user", username: "player_one" },
  ]);
});

void test("another user's username cannot be claimed", async () => {
  const { calls, repository } = createUsernameRepository({
    occupantId: "user_2",
  });
  const result = await changeUsername("user_1", "player_two", repository);
  assert.deepEqual(result, { status: "username_taken" });
  assert.equal(calls.length, 0);
});

void test("invalid usernames are rejected before persistence", async () => {
  const { calls, repository } = createUsernameRepository();
  await assert.rejects(
    changeUsername("user_1", "admin", repository),
    /reserved/i,
  );
  assert.equal(calls.length, 0);
});

void test("a unique-constraint race becomes a safe username result", async () => {
  const conflict = Object.assign(new Error("Unique constraint failed."), {
    code: "P2002",
  });
  const { repository } = createUsernameRepository({
    updateError: conflict,
  });
  const result = await changeUsername("user_1", "player_one", repository);
  assert.deepEqual(result, { status: "username_taken" });
});
