import { expect, test } from "vitest";

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

test("profile avatars accept managed local paths and external HTTP URLs", () => {
  expect(
    getProfileAvatarUrl("/api/storage/users/user_1/avatar/image.png"),
  ).toBe("/api/storage/users/user_1/avatar/image.png");
  expect(getProfileAvatarUrl("https://images.example.com/avatar.png")).toBe(
    "https://images.example.com/avatar.png",
  );
  expect(getProfileAvatarUrl("javascript:alert(1)")).toBe(null);
  expect(getProfileAvatarUrl("/unexpected/local/path.png")).toBe(null);
  expect(getProfileAvatarUrl(null)).toBe(null);
});

test("avatar replacement updates the profile before deleting the prior managed object", async () => {
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
  expect(events).toStrictEqual(["upload", "update-profile", "delete-old"]);
  expect(avatar.avatarObjectKey?.startsWith("users/user_1/avatar/")).toBe(true);
  expect(result.cleanupFailed).toBe(false);
});

test("external avatars are cleared without asking storage to delete their URL", async () => {
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
      expect(avatar).toStrictEqual({ avatarUrl: null, avatarObjectKey: null });
      return Promise.resolve(true);
    },
  };
  expect(
    await removeProfileAvatar("user_1", { storage, repository }),
  ).toStrictEqual({
    removed: true,
    cleanupFailed: false,
  });
  expect(deletes).toBe(0);
});
