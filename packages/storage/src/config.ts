import { loadStorageEnvironment } from "@townhawll/config/server-env";

import { createLocalStorage } from "./local.ts";
import { createR2Storage } from "./r2.ts";
import type { ObjectStorage } from "./types.ts";

let storagePromise: Promise<ObjectStorage> | undefined;

export function createStorage(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ObjectStorage> {
  const config = loadStorageEnvironment(environment);
  if (config.driver === "local") return createLocalStorage();
  return Promise.resolve(createR2Storage(config));
}

export function getStorage(): Promise<ObjectStorage> {
  storagePromise ??= createStorage();
  return storagePromise;
}
