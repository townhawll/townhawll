import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadStorageEnvironment } from "@townhawll/config/server-env";

import { createObjectKey } from "./keys.ts";
import { createLocalStorage } from "./local.ts";
import { AVATAR_MAX_BYTES, validateImageBytes } from "./validation.ts";

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

void test("storage configuration selects local safely and requires complete R2 settings", () => {
  assert.equal(
    loadStorageEnvironment({ NODE_ENV: "development" }).driver,
    "local",
  );
  assert.equal(
    loadStorageEnvironment({
      NODE_ENV: "development",
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "bucket",
      R2_PUBLIC_URL: "https://media.example.com",
    }).driver,
    "r2",
  );
  assert.throws(() => loadStorageEnvironment({ NODE_ENV: "production" }));
  assert.throws(() =>
    loadStorageEnvironment({
      NODE_ENV: "development",
      STORAGE_DRIVER: "r2",
      R2_ACCOUNT_ID: "partial",
    }),
  );
});

void test("object keys are generated below a safe caller-owned prefix", () => {
  const key = createObjectKey({
    prefix: "users/user_1/avatar",
    extension: ".PNG",
  });
  assert.match(key, /^users\/user_1\/avatar\/[0-9a-f-]+\.png$/);
  assert.throws(() =>
    createObjectKey({ prefix: "../unsafe", extension: "png" }),
  );
});

void test("image validation trusts bytes rather than extensions or MIME alone", () => {
  assert.equal(
    validateImageBytes({ bytes: png, claimedContentType: "image/png" })
      .extension,
    "png",
  );
  assert.throws(() =>
    validateImageBytes({ bytes: png, claimedContentType: "image/jpeg" }),
  );
  assert.throws(() => validateImageBytes({ bytes: Uint8Array.of() }));
  assert.throws(() =>
    validateImageBytes({ bytes: new Uint8Array(AVATAR_MAX_BYTES + 1) }),
  );
});

void test("local storage writes, reads, resolves, and deletes objects", async () => {
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
    assert.equal(uploaded.publicUrl, "/api/storage/tests/avatar/image.png");
    assert.deepEqual(
      await readFile(path.join(root, ...key.split("/"))),
      Buffer.from(png),
    );
    const object = await storage.readObject?.(key);
    assert.equal(object?.contentType, "image/png");
    assert.deepEqual(Buffer.from(object?.body ?? []), Buffer.from(png));
    await storage.deleteObject(key);
    assert.equal(await storage.readObject?.(key), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
