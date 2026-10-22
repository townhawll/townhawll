import { loadStorageEnvironment } from "@townhawll/config/server-env";
import {
  getStorage,
  isPublicMediaObjectKey,
  StorageError,
} from "@townhawll/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const environment = loadStorageEnvironment();
  if (environment.driver !== "local") {
    return new Response(null, { status: 404 });
  }

  try {
    const storage = await getStorage();
    const key = (await params).key.join("/");
    if (!isPublicMediaObjectKey(key))
      return new Response(null, { status: 404 });
    const object = await storage.readObject?.(key);
    if (!object) return new Response(null, { status: 404 });
    return new Response(new Blob([Uint8Array.from(object.body)]), {
      headers: {
        "cache-control": object.cacheControl ?? "public, max-age=3600",
        "content-type": object.contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof StorageError && error.code === "INVALID_KEY") {
      return new Response(null, { status: 404 });
    }
    throw error;
  }
}
