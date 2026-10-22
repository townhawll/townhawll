import { expect, test, vi } from "vitest";
import sharp from "sharp";

import type { ObjectStorage } from "@townhawll/storage";

import {
  type AvatarRepository,
  type AvatarReference,
  getProfileAvatarUrl,
  removeProfileAvatar,
  replaceProfileAvatar,
  resolveProfileAvatarUrl,
  AvatarConflictError,
} from "./avatar.ts";
import { prepareAvatarImage, AVATAR_MAX_DIMENSION } from "./avatar-image.ts";

const png = await sharp({
  create: { width: 8, height: 4, channels: 4, background: "red" },
})
  .png()
  .toBuffer();

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
    avatarUrl: "https://media.example.com/users/user_1/avatar/old.png",
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
  expect(avatar.avatarObjectKey).toMatch(/^users\/[0-9a-f-]{36}\.webp$/);
  expect(avatar.avatarUrl).toBeNull();
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
    avatarUrl: null,
  });
  expect(deletes).toBe(0);
});

function dependencies(
  previous = {
    avatarObjectKey: "users/user_1/avatar/old.png",
    avatarUrl: "https://old.example/users/user_1/avatar/old.png",
  } as { avatarObjectKey: string | null; avatarUrl: string | null },
) {
  let current = structuredClone(previous);
  const storage = {
    driver: "r2",
    getPublicUrl: (key) => `https://media.example.com/${key}`,
    uploadObject: vi.fn<ObjectStorage["uploadObject"]>((input) =>
      Promise.resolve({
        key: input.key,
        publicUrl: `https://media.example.com/${input.key}`,
      }),
    ),
    deleteObject: vi.fn<ObjectStorage["deleteObject"]>(() => Promise.resolve()),
  } satisfies ObjectStorage;
  const commit = (
    _id: string,
    avatar: AvatarReference,
    expected: AvatarReference,
  ) => {
    if (
      current.avatarObjectKey !== expected.avatarObjectKey ||
      current.avatarUrl !== expected.avatarUrl
    )
      return Promise.resolve(false);
    current = avatar;
    return Promise.resolve(true);
  };
  const repository = {
    getAvatar: vi.fn<AvatarRepository["getAvatar"]>(() =>
      Promise.resolve(structuredClone(current)),
    ),
    setAvatar: vi.fn(commit),
  } satisfies AvatarRepository;
  return { storage, repository, commit, current: () => current };
}

test("managed avatar URLs are derived from keys, including legacy keys after a CDN change", async () => {
  const { storage } = dependencies();
  for (const key of [
    "users/user_1/avatar/old.png",
    "users/12345678-1234-4234-8234-123456789012.webp",
  ]) {
    expect(
      await resolveProfileAvatarUrl(
        { avatarObjectKey: key, avatarUrl: "https://old.example/obsolete" },
        storage,
      ),
    ).toBe(`https://media.example.com/${key}`);
  }
  expect(
    await resolveProfileAvatarUrl(
      { avatarUrl: "https://google.example/avatar" },
      storage,
    ),
  ).toBe("https://google.example/avatar");
  expect(
    await resolveProfileAvatarUrl(
      { avatarObjectKey: "private/image.png" },
      storage,
    ),
  ).toBeNull();
  expect(getProfileAvatarUrl("/api/storage/private/image.png")).toBeNull();
  expect(
    getProfileAvatarUrl("https://user:secret@example.com/avatar.png"),
  ).toBeNull();
});

test("avatars are decoded and re-encoded as bounded WebP without upscaling", async () => {
  const small = await prepareAvatarImage({
    bytes: png,
    claimedContentType: "image/png",
  });
  expect(small.contentType).toBe("image/webp");
  expect(await sharp(small.bytes).metadata()).toMatchObject({
    format: "webp",
    width: 8,
    height: 4,
  });
  const large = await sharp({
    create: { width: 1200, height: 600, channels: 3, background: "blue" },
  })
    .withMetadata()
    .jpeg()
    .toBuffer();
  const processed = await prepareAvatarImage({
    bytes: large,
    claimedContentType: "image/jpeg",
  });
  const info = await sharp(processed.bytes).metadata();
  expect(info.width).toBe(AVATAR_MAX_DIMENSION);
  expect(info.height).toBe(AVATAR_MAX_DIMENSION / 2);
  expect(info.exif).toBeUndefined();
});

test("corrupt, unsupported, MIME-mismatched and excessive images never reach storage", async () => {
  const deps = dependencies();
  const corrupt = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  for (const bytes of [
    corrupt,
    new TextEncoder().encode("<svg></svg>"),
    new Uint8Array(5 * 1024 * 1024 + 1),
  ])
    await expect(
      replaceProfileAvatar("user_1", { bytes }, deps),
    ).rejects.toMatchObject({ code: "INVALID_FILE" });
  await expect(
    replaceProfileAvatar(
      "user_1",
      { bytes: png, claimedContentType: "image/jpeg" },
      deps,
    ),
  ).rejects.toMatchObject({ code: "INVALID_FILE" });
  expect(deps.storage.uploadObject).not.toHaveBeenCalled();
  expect(deps.repository.setAvatar).not.toHaveBeenCalled();
});

test("decoded pixel limits reject excessive image dimensions", async () => {
  const image = await sharp({
    create: { width: 4001, height: 4001, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await expect(prepareAvatarImage({ bytes: image })).rejects.toMatchObject({
    code: "INVALID_FILE",
  });
});

test("missing profiles fail before uploading, and upload failures preserve the old reference", async () => {
  const deps = dependencies();
  vi.mocked(deps.repository.getAvatar).mockResolvedValueOnce(null);
  await expect(
    replaceProfileAvatar("user_1", { bytes: png }, deps),
  ).rejects.toThrow();
  expect(deps.storage.uploadObject).not.toHaveBeenCalled();
  vi.mocked(deps.storage.uploadObject).mockRejectedValueOnce(
    new Error("upload failed"),
  );
  await expect(
    replaceProfileAvatar("user_1", { bytes: png }, deps),
  ).rejects.toThrow();
  expect(deps.repository.setAvatar).not.toHaveBeenCalled();
  expect(deps.storage.deleteObject).not.toHaveBeenCalled();
});

test("a rejected conditional update only cleans the unused new object", async () => {
  const deps = dependencies();
  vi.mocked(deps.repository.setAvatar).mockResolvedValueOnce(false);
  await expect(
    replaceProfileAvatar("user_1", { bytes: png }, deps),
  ).rejects.toBeInstanceOf(AvatarConflictError);
  expect(deps.storage.deleteObject).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(/^users\/[0-9a-f-]{36}\.webp$/),
  );
});

test("an uncertain DB response never deletes potentially committed media", async () => {
  const deps = dependencies();
  vi.mocked(deps.repository.setAvatar).mockImplementationOnce(
    async (...args) => {
      await deps.commit(...args);
      throw new Error("lost commit response");
    },
  );
  await expect(
    replaceProfileAvatar("user_1", { bytes: png }, deps),
  ).rejects.toThrow();
  expect(deps.storage.deleteObject).not.toHaveBeenCalled();
});

test("animated input is rejected instead of silently using its first frame", async () => {
  const data = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]);
  const image = await sharp(data, {
    raw: { width: 1, height: 2, channels: 4, pageHeight: 1 },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  expect((await sharp(image).metadata()).pages).toBe(2);
  await expect(
    prepareAvatarImage({ bytes: image, claimedContentType: "image/webp" }),
  ).rejects.toMatchObject({ code: "INVALID_FILE" });
});

test("cleanup failure leaves the successfully saved avatar in place", async () => {
  const deps = dependencies();
  vi.mocked(deps.storage.deleteObject).mockRejectedValueOnce(
    new Error("delete failed"),
  );
  const result = await replaceProfileAvatar("user_1", { bytes: png }, deps);
  expect(result.cleanupFailed).toBe(true);
  expect(result.avatarUrl).toContain(deps.current().avatarObjectKey);
});

test("external OAuth fallbacks survive managed replacement and removal", async () => {
  const deps = dependencies({
    avatarObjectKey: null,
    avatarUrl: "https://google.example/avatar",
  });
  await replaceProfileAvatar("user_1", { bytes: png }, deps);
  expect(deps.storage.deleteObject).not.toHaveBeenCalled();
  expect(deps.current().avatarUrl).toBe("https://google.example/avatar");
  const current = deps.current().avatarObjectKey;
  const result = await removeProfileAvatar("user_1", deps);
  expect(result.avatarUrl).toBe("https://google.example/avatar");
  expect(deps.storage.deleteObject).toHaveBeenCalledExactlyOnceWith(current);
});

test("removal conflicts and unrelated object references cannot delete another asset", async () => {
  const deps = dependencies();
  vi.mocked(deps.repository.setAvatar).mockResolvedValueOnce(false);
  await expect(removeProfileAvatar("user_1", deps)).rejects.toBeInstanceOf(
    AvatarConflictError,
  );
  expect(deps.storage.deleteObject).not.toHaveBeenCalled();
  for (const key of ["titles/old.webp", "users/other_user/avatar/old.png"]) {
    const unrelated = dependencies({ avatarObjectKey: key, avatarUrl: null });
    await removeProfileAvatar("user_1", unrelated);
    expect(unrelated.storage.deleteObject).not.toHaveBeenCalled();
  }
});

test("concurrent replacements preserve the winner and delete only old/losing objects", async () => {
  const deps = dependencies();
  const previous = structuredClone(deps.current());
  vi.mocked(deps.repository.getAvatar).mockImplementation(() =>
    Promise.resolve(previous),
  );
  const outcomes = await Promise.allSettled([
    replaceProfileAvatar("user_1", { bytes: png }, deps),
    replaceProfileAvatar("user_1", { bytes: png }, deps),
  ]);
  expect(outcomes.filter((value) => value.status === "fulfilled")).toHaveLength(
    1,
  );
  expect(deps.storage.deleteObject).not.toHaveBeenCalledWith(
    deps.current().avatarObjectKey,
  );
  expect(deps.storage.deleteObject).toHaveBeenCalledTimes(2);
});
