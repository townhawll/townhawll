import assert from "node:assert/strict";
import test from "node:test";

import type { ObjectStorage } from "@townhawll/storage";

import {
  type AvatarRepository,
  getProfileAvatarUrl,
  removeProfileAvatar,
  replaceProfileAvatar,
} from "./avatar.ts";

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

void test("profile avatars accept managed local paths and external HTTP URLs", () => {
  assert.equal(
    getProfileAvatarUrl("/api/storage/users/user_1/avatar/image.png"),
    "/api/storage/users/user_1/avatar/image.png",
  );
  assert.equal(
    getProfileAvatarUrl("https://images.example.com/avatar.png"),
    "https://images.example.com/avatar.png",
  );
  assert.equal(getProfileAvatarUrl("javascript:alert(1)"), null);
  assert.equal(getProfileAvatarUrl("/unexpected/local/path.png"), null);
  assert.equal(getProfileAvatarUrl(null), null);
});

void test("avatar replacement updates the profile before deleting the prior managed object", async () => {
  const events: string[] = [];
  let avatar: { avatarUrl: string | null; avatarObjectKey: string | null } = {
    avatarUrl: "https://media.example.com/old.png",
    avatarObjectKey: "users/user_1/avatar/old.png",
  };
  const storage: ObjectStorage = {
    driver: "r2",
    getPublicUrl: (key) => `https://media.example.com/${key}`,
    uploadObject(input) {
      events.push("upload");
      return Promise.resolve({
        key: input.key,
        publicUrl: `https://media.example.com/${input.key}`,
      });
    },
    deleteObject() {
      events.push("delete-old");
      return Promise.resolve();
    },
  };
  const repository: AvatarRepository = {
    getAvatar() {
      return Promise.resolve(avatar);
    },
    setAvatar(_userId, value) {
      events.push("update-profile");
      avatar = value;
      return Promise.resolve(true);
    },
  };

  const result = await replaceProfileAvatar(
    "user_1",
    { bytes: png, claimedContentType: "image/png" },
    { storage, repository },
  );
  assert.deepEqual(events, ["upload", "update-profile", "delete-old"]);
  assert.equal(
    avatar.avatarObjectKey?.startsWith("users/user_1/avatar/"),
    true,
  );
  assert.equal(result.cleanupFailed, false);
});

void test("external avatars are cleared without asking storage to delete their URL", async () => {
  let deletes = 0;
  const storage: ObjectStorage = {
    driver: "r2",
    getPublicUrl: (key) => key,
    uploadObject(input) {
      return Promise.resolve({ key: input.key, publicUrl: input.key });
    },
    deleteObject() {
      deletes += 1;
      return Promise.resolve();
    },
  };
  const repository: AvatarRepository = {
    getAvatar() {
      return Promise.resolve({
        avatarUrl: "https://google.example/avatar",
        avatarObjectKey: null,
      });
    },
    setAvatar(_userId, avatar) {
      assert.deepEqual(avatar, { avatarUrl: null, avatarObjectKey: null });
      return Promise.resolve(true);
    },
  };
  assert.deepEqual(
    await removeProfileAvatar("user_1", { storage, repository }),
    {
      removed: true,
      cleanupFailed: false,
    },
  );
  assert.equal(deletes, 0);
});
