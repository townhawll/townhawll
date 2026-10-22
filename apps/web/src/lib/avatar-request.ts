import { AVATAR_MAX_BYTES } from "@townhawll/storage/validation";
import { StorageValidationError } from "@townhawll/storage";

export const AVATAR_MAX_REQUEST_BYTES = AVATAR_MAX_BYTES + 64 * 1024;

export function isSameOriginAvatarRequest(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}

/** Bound actual bytes, including multipart overhead; Content-Length is only a hint. */
export async function readAvatarFormData(request: Request): Promise<FormData> {
  const reader = request.body?.getReader();
  if (!reader)
    throw new StorageValidationError(
      "Choose an image to upload.",
      "INVALID_FILE",
    );
  let size = 0;
  const limited = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read();
      if (chunk.done) {
        controller.close();
        return;
      }
      size += chunk.value.byteLength;
      if (size > AVATAR_MAX_REQUEST_BYTES) {
        controller.error(
          new StorageValidationError(
            "Choose an image smaller than 5 MB.",
            "INVALID_FILE",
          ),
        );
        await reader.cancel();
        return;
      }
      controller.enqueue(chunk.value);
    },
    cancel: () => reader.cancel(),
  });
  try {
    return await new Response(limited, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof StorageValidationError) throw error;
    throw new StorageValidationError(
      "Choose a valid image upload.",
      "INVALID_FILE",
    );
  }
}
