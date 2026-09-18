export { createStorage, getStorage } from "./config.ts";
export { StorageError, StorageValidationError } from "./errors.ts";
export { createObjectKey } from "./keys.ts";
export { createLocalStorage } from "./local.ts";
export type {
  ObjectStorage,
  ReadObjectResult,
  StoredObject,
  UploadObjectInput,
} from "./types.ts";
