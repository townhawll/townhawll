import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { StorageError } from "./errors.ts";
import { assertSafeObjectKey, encodeObjectKey } from "./keys.ts";
import type { ObjectStorage } from "./types.ts";

export function createR2Storage(config: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}): ObjectStorage {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const publicUrl = config.publicUrl.replace(/\/$/, "");
  const getPublicUrl = (key: string) => `${publicUrl}/${encodeObjectKey(key)}`;

  return {
    driver: "r2",
    getPublicUrl,
    async uploadObject(input) {
      assertSafeObjectKey(input.key);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucketName,
            Key: input.key,
            Body: input.body,
            ContentType: input.contentType,
            CacheControl: input.cacheControl,
          }),
        );
      } catch (error) {
        throw new StorageError(
          "The object upload failed.",
          "OPERATION_FAILED",
          { cause: error },
        );
      }
      return { key: input.key, publicUrl: getPublicUrl(input.key) };
    },
    async deleteObject(key) {
      assertSafeObjectKey(key);
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }),
        );
      } catch (error) {
        throw new StorageError(
          "The object deletion failed.",
          "OPERATION_FAILED",
          { cause: error },
        );
      }
    },
  };
}
