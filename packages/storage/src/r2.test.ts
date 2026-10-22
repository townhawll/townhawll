import { expect, test, vi } from "vitest";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createR2Storage } from "./r2.ts";

const send = vi.hoisted(() => vi.fn<(command: unknown) => Promise<unknown>>());
vi.mock("@aws-sdk/client-s3", async (original) => {
  const actual = await original<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: class {
      send = send;
    },
  };
});

test("R2 creates immutable objects with accurate MIME and cache headers", async () => {
  send.mockResolvedValue({ $metadata: {} });
  const storage = createR2Storage({
    accountId: "account",
    accessKeyId: "key",
    secretAccessKey: "secret",
    bucketName: "public-media",
    publicUrl: "https://media.example.com/",
  });
  const key = "users/12345678-1234-4234-8234-123456789012.webp";
  const result = await storage.uploadObject({
    key,
    body: Uint8Array.of(1),
    contentType: "image/webp",
    cacheControl: "public, max-age=31536000, immutable",
  });
  const command: unknown = send.mock.calls[0]?.[0];
  expect(command).toBeInstanceOf(PutObjectCommand);
  if (!(command instanceof PutObjectCommand))
    throw new Error("Expected immutable put.");
  expect(command.input).toMatchObject({
    Bucket: "public-media",
    Key: key,
    IfNoneMatch: "*",
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
  });
  expect(result.publicUrl).toBe(`https://media.example.com/${key}`);
  send.mockRejectedValueOnce(new Error("Precondition failed"));
  await expect(
    storage.uploadObject({
      key,
      body: Uint8Array.of(2),
      contentType: "image/webp",
    }),
  ).rejects.toMatchObject({ code: "OPERATION_FAILED" });
});
