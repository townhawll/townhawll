import sharp from "sharp";
import { StorageValidationError } from "@townhawll/storage";
import { validateImageBytes } from "@townhawll/storage/validation";

// An avatar-specific upload policy, independent of catalogue processing profiles.
export const AVATAR_MAX_PIXELS = 16_000_000;
export const AVATAR_MAX_DIMENSION = 512;

export async function prepareAvatarImage(input: {
  bytes: Uint8Array;
  claimedContentType?: string;
}) {
  const validated = validateImageBytes(input);
  try {
    const image = sharp(validated.bytes, {
      limitInputPixels: AVATAR_MAX_PIXELS,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > AVATAR_MAX_PIXELS ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error("Unsupported avatar image.");
    const bytes = await image
      .autoOrient()
      .resize({
        width: AVATAR_MAX_DIMENSION,
        height: AVATAR_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColourspace("srgb")
      .webp({ quality: 80 })
      .timeout({ seconds: 10 })
      .toBuffer();
    // Re-encoding validates decoded pixels and strips source metadata by default.
    return {
      bytes,
      contentType: "image/webp" as const,
      extension: "webp" as const,
    };
  } catch {
    throw new StorageValidationError(
      "Choose a valid, non-animated JPEG, PNG, or WebP image up to 16 megapixels.",
      "INVALID_FILE",
    );
  }
}
