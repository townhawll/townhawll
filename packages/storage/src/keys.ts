import { randomUUID } from "node:crypto";

import { StorageValidationError } from "./errors.ts";

const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_-]*\.[a-z0-9]+$/;
const SAFE_PREFIX = /^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/;

function trimForwardSlashes(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && value[start] === "/") start += 1;
  while (end > start && value[end - 1] === "/") end -= 1;

  return value.slice(start, end);
}

export function assertSafeObjectKey(key: string): void {
  if (
    key.length > 512 ||
    !SAFE_KEY.test(key) ||
    key.includes("//") ||
    key.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new StorageValidationError(
      "The object key is invalid.",
      "INVALID_KEY",
    );
  }
}

export function createObjectKey(input: {
  prefix: string;
  extension: string;
}): string {
  const prefix = trimForwardSlashes(input.prefix);
  const normalizedExtension = input.extension.toLowerCase();
  const extension = normalizedExtension.startsWith(".")
    ? normalizedExtension.slice(1)
    : normalizedExtension;
  if (!SAFE_PREFIX.test(prefix) || !/^[a-z0-9]+$/.test(extension)) {
    throw new StorageValidationError(
      "The object key input is invalid.",
      "INVALID_KEY",
    );
  }
  const key = `${prefix}/${randomUUID()}.${extension}`;
  assertSafeObjectKey(key);
  return key;
}

export function encodeObjectKey(key: string): string {
  assertSafeObjectKey(key);
  return key.split("/").map(encodeURIComponent).join("/");
}
