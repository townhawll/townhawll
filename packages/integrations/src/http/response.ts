import { z } from "zod";

import { ProviderHttpError, type HttpProvider } from "./errors.js";

export function validateProviderResponse<T>(
  provider: HttpProvider,
  schema: z.ZodType<T>,
  payload: unknown,
): T {
  const result = schema.safeParse(payload);
  if (!result.success)
    throw new ProviderHttpError(provider, "INVALID_RESPONSE");
  return result.data;
}

export async function readJsonResponse(
  response: Response,
  provider: HttpProvider,
  maxBytes: number,
  signal: AbortSignal,
): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length !== null && /^\d+$/.test(length) && Number(length) > maxBytes) {
    void response.body?.cancel().catch(() => undefined);
    throw new ProviderHttpError(provider, "RESPONSE_TOO_LARGE");
  }
  if (!response.body) throw new ProviderHttpError(provider, "INVALID_JSON");
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes)
        throw new ProviderHttpError(provider, "RESPONSE_TOO_LARGE");
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      const result: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
      return result;
    } catch {
      throw new ProviderHttpError(provider, "INVALID_JSON");
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
