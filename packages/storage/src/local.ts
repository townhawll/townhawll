import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { StorageError } from "./errors.ts";
import { assertSafeObjectKey, encodeObjectKey } from "./keys.ts";
import type {
  ObjectStorage,
  ReadObjectResult,
  UploadObjectInput,
} from "./types.ts";

interface LocalMetadata {
  contentType: string;
  cacheControl?: string;
}

async function findWorkspaceRoot(start: string): Promise<string> {
  let directory = path.resolve(start);
  while (true) {
    try {
      await access(path.join(directory, "pnpm-workspace.yaml"));
      return directory;
    } catch {
      const parent = path.dirname(directory);
      if (parent === directory) return path.resolve(start);
      directory = parent;
    }
  }
}

function objectPath(root: string, key: string): string {
  assertSafeObjectKey(key);
  const resolved = path.resolve(root, ...key.split("/"));
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new StorageError("The object key is invalid.", "INVALID_KEY");
  }
  return resolved;
}

async function ignoreMissingDelete(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
}

export async function createLocalStorage(options?: {
  rootDirectory?: string;
  publicPath?: string;
}): Promise<ObjectStorage> {
  const workspaceRoot = await findWorkspaceRoot(process.cwd());
  const root = path.resolve(
    /* turbopackIgnore: true */
    options?.rootDirectory ?? path.join(workspaceRoot, ".tmp", "storage"),
  );
  const publicPath = (options?.publicPath ?? "/api/storage").replace(/\/$/, "");
  const getPublicUrl = (key: string) => `${publicPath}/${encodeObjectKey(key)}`;

  return {
    driver: "local",
    getPublicUrl,
    async uploadObject(input: UploadObjectInput) {
      const filePath = objectPath(root, input.key);
      const metadataPath = `${filePath}.metadata.json`;
      await mkdir(path.dirname(filePath), { recursive: true });
      const metadata: LocalMetadata = {
        contentType: input.contentType,
        ...(input.cacheControl ? { cacheControl: input.cacheControl } : {}),
      };
      try {
        await writeFile(filePath, input.body, { flag: "wx" });
        await writeFile(metadataPath, JSON.stringify(metadata), { flag: "wx" });
      } catch (error) {
        await Promise.allSettled([
          ignoreMissingDelete(filePath),
          ignoreMissingDelete(metadataPath),
        ]);
        throw new StorageError(
          "The local object could not be written.",
          "OPERATION_FAILED",
          { cause: error },
        );
      }
      return { key: input.key, publicUrl: getPublicUrl(input.key) };
    },
    async deleteObject(key) {
      const filePath = objectPath(root, key);
      try {
        await Promise.all([
          ignoreMissingDelete(filePath),
          ignoreMissingDelete(`${filePath}.metadata.json`),
        ]);
      } catch (error) {
        throw new StorageError(
          "The local object could not be deleted.",
          "OPERATION_FAILED",
          { cause: error },
        );
      }
    },
    async readObject(key): Promise<ReadObjectResult | null> {
      const filePath = objectPath(root, key);
      try {
        const [body, rawMetadata] = await Promise.all([
          readFile(filePath),
          readFile(`${filePath}.metadata.json`, "utf8"),
        ]);
        const metadata = JSON.parse(rawMetadata) as LocalMetadata;
        if (typeof metadata.contentType !== "string") {
          throw new Error("Invalid local object metadata.");
        }
        return {
          body,
          contentType: metadata.contentType,
          ...(metadata.cacheControl
            ? { cacheControl: metadata.cacheControl }
            : {}),
        };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return null;
        }
        throw new StorageError(
          "The local object could not be read.",
          "OPERATION_FAILED",
          { cause: error },
        );
      }
    },
  };
}
