import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

import { loadStorageEnvironment } from "@townhawll/config/server-env";

import { createObjectKey } from "./keys.ts";
import { createLocalStorage } from "./local.ts";
import { AVATAR_MAX_BYTES, validateImageBytes } from "./validation.ts";

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

test("storage configuration selects local safely and requires complete R2 settings", () => {
  expect(loadStorageEnvironment({ NODE_ENV: "development" }).driver).toBe(
    "local",
  );
  expect(
    loadStorageEnvironment({
      NODE_ENV: "development",
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "bucket",
      R2_PUBLIC_URL: "https://media.example.com",
    }).driver,
  ).toBe("r2");
  expect(() => loadStorageEnvironment({ NODE_ENV: "production" })).toThrow();
  expect(() =>
    loadStorageEnvironment({
      NODE_ENV: "development",
      STORAGE_DRIVER: "r2",
      R2_ACCOUNT_ID: "partial",
    }),
  ).toThrow();
});

test("object keys are generated below a safe caller-owned prefix", () => {
  const key = createObjectKey({
    prefix: "users/user_1/avatar",
    extension: ".PNG",
  });
  expect(key).toMatch(/^users\/user_1\/avatar\/[0-9a-f-]+\.png$/);
  expect(() =>
    createObjectKey({ prefix: "../unsafe", extension: "png" }),
  ).toThrow();
  expect(
    createObjectKey({
      prefix: `${"/".repeat(10_000)}users/user_1/avatar${"/".repeat(10_000)}`,
      extension: "png",
    }),
  ).toMatch(/^users\/user_1\/avatar\/[0-9a-f-]+\.png$/);
});

test("image validation trusts bytes rather than extensions or MIME alone", () => {
  expect(
    validateImageBytes({ bytes: png, claimedContentType: "image/png" })
      .extension,
  ).toBe("png");
  expect(() =>
    validateImageBytes({ bytes: png, claimedContentType: "image/jpeg" }),
  ).toThrow();
  expect(() => validateImageBytes({ bytes: Uint8Array.of() })).toThrow();
  expect(() =>
    validateImageBytes({ bytes: new Uint8Array(AVATAR_MAX_BYTES + 1) }),
  ).toThrow();
});

test("local storage writes, reads, resolves, and deletes objects", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "townhawll-storage-"));
  try {
    const storage = await createLocalStorage({ rootDirectory: root });
    const key = "tests/avatar/image.png";
    const uploaded = await storage.uploadObject({
      key,
      body: png,
      contentType: "image/png",
      cacheControl: "public, max-age=60",
    });
    expect(uploaded.publicUrl).toBe("/api/storage/tests/avatar/image.png");
    expect(await readFile(path.join(root, ...key.split("/")))).toStrictEqual(
      Buffer.from(png),
    );
    const object = await storage.readObject?.(key);
    expect(object?.contentType).toBe("image/png");
    expect(Buffer.from(object?.body ?? [])).toStrictEqual(Buffer.from(png));
    await storage.deleteObject(key);
    expect(await storage.readObject?.(key)).toBe(null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
