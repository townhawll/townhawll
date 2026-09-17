import { StorageValidationError } from "./errors.ts";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";

export interface ValidatedImage {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
}

function matches(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function detectImage(bytes: Uint8Array): Omit<ValidatedImage, "bytes"> | null {
  if (
    bytes.length >= 12 &&
    matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
    matches(bytes.slice(-12), [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44])
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 4 &&
    matches(bytes, [0xff, 0xd8, 0xff]) &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9
  ) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    const declaredSize = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(4, true);
    if (declaredSize + 8 <= bytes.length) {
      return { contentType: "image/webp", extension: "webp" };
    }
  }
  return null;
}

export function validateImageBytes(input: {
  bytes: Uint8Array;
  claimedContentType?: string;
  maxBytes?: number;
}): ValidatedImage {
  const maxBytes = input.maxBytes ?? AVATAR_MAX_BYTES;
  if (input.bytes.length === 0) {
    throw new StorageValidationError("The image is empty.", "INVALID_FILE");
  }
  if (input.bytes.length > maxBytes) {
    throw new StorageValidationError("The image is too large.", "INVALID_FILE");
  }
  const detected = detectImage(input.bytes);
  if (!detected) {
    throw new StorageValidationError(
      "Use a valid JPEG, PNG, or WebP image.",
      "INVALID_FILE",
    );
  }
  if (
    input.claimedContentType &&
    input.claimedContentType !== "application/octet-stream" &&
    input.claimedContentType !== detected.contentType
  ) {
    throw new StorageValidationError(
      "The file contents do not match its reported image type.",
      "INVALID_FILE",
    );
  }
  return { bytes: input.bytes, ...detected };
}
