import {
  createMediaObjectKey,
  getStorage,
  isPublicMediaObjectKey,
  type ObjectStorage,
} from "@townhawll/storage";

export interface AvatarReference {
  avatarUrl: string | null;
  avatarObjectKey: string | null;
}

export class AvatarConflictError extends Error {
  override name = "AvatarConflictError";
  constructor() {
    super("Your avatar changed. Refresh and try again.");
  }
}

export interface AvatarRepository {
  getAvatar(userId: string): Promise<{
    avatarUrl: string | null;
    avatarObjectKey: string | null;
  } | null>;
  setAvatar(
    userId: string,
    avatar: AvatarReference,
    expected: AvatarReference,
  ): Promise<boolean>;
}

export function getProfileAvatarUrl(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith("/api/storage/"))
    return isPublicMediaObjectKey(value.slice("/api/storage/".length))
      ? value
      : null;

  try {
    const url = new URL(value);
    return !url.username &&
      !url.password &&
      (url.protocol === "https:" || url.protocol === "http:")
      ? value
      : null;
  } catch {
    return null;
  }
}

/** Managed keys take precedence; full URLs are legacy/external fallbacks only. */
export async function resolveProfileAvatarUrl(
  avatar: { avatarUrl?: string | null; avatarObjectKey?: string | null },
  storage?: Pick<ObjectStorage, "getPublicUrl">,
): Promise<string | null> {
  if (avatar.avatarObjectKey) {
    if (
      !avatar.avatarObjectKey.startsWith("users/") ||
      !isPublicMediaObjectKey(avatar.avatarObjectKey)
    )
      return null;
    return (storage ?? (await getStorage())).getPublicUrl(
      avatar.avatarObjectKey,
    );
  }
  return getProfileAvatarUrl(avatar.avatarUrl);
}

function externalFallback(avatar: AvatarReference): string | null {
  const value = getProfileAvatarUrl(avatar.avatarUrl);
  if (!value || !avatar.avatarObjectKey) return value;
  // Drop duplicated managed URLs even when they used a previous CDN domain.
  const pathname = new URL(value, "https://local.invalid").pathname;
  return pathname.endsWith(`/${avatar.avatarObjectKey}`) ? null : value;
}

function isOwnedAvatarKey(key: string, userId: string): boolean {
  return (
    isPublicMediaObjectKey(key) &&
    (/^users\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpe?g)$/.test(
      key,
    ) ||
      key.startsWith(`users/${userId}/avatar/`))
  );
}

async function createAvatarRepository(): Promise<AvatarRepository> {
  const { db } = await import("@townhawll/db");
  return {
    getAvatar(userId) {
      return db.profile.findUnique({
        where: { userId },
        select: { avatarUrl: true, avatarObjectKey: true },
      });
    },
    async setAvatar(userId, avatar, expected) {
      const result = await db.profile.updateMany({
        where: {
          userId,
          avatarObjectKey: expected.avatarObjectKey,
          avatarUrl: expected.avatarUrl,
        },
        data: avatar,
      });
      return result.count === 1;
    },
  };
}

export interface AvatarServiceDependencies {
  storage: ObjectStorage;
  repository: AvatarRepository;
}

async function getDependencies(): Promise<AvatarServiceDependencies> {
  const [storage, repository] = await Promise.all([
    getStorage(),
    createAvatarRepository(),
  ]);
  return { storage, repository };
}

export async function replaceProfileAvatar(
  userId: string,
  input: { bytes: Uint8Array; claimedContentType?: string },
  dependencies?: AvatarServiceDependencies,
): Promise<{ avatarUrl: string; cleanupFailed: boolean }> {
  const { prepareAvatarImage } = await import("./avatar-image.ts");
  const validated = await prepareAvatarImage(input);
  const resolvedDependencies = dependencies ?? (await getDependencies());
  const previous = await resolvedDependencies.repository.getAvatar(userId);
  if (!previous) throw new Error("The profile does not exist.");
  const key = createMediaObjectKey({
    category: "users",
    extension: validated.extension,
  });
  const uploaded = await resolvedDependencies.storage.uploadObject({
    key,
    body: validated.bytes,
    contentType: validated.contentType,
    cacheControl: "public, max-age=31536000, immutable",
  });

  // A thrown DB error can mean the commit succeeded but its response was lost.
  // Keep the object on uncertain outcomes rather than deleting a possibly active avatar.
  const updated = await resolvedDependencies.repository.setAvatar(
    userId,
    {
      avatarUrl: externalFallback(previous),
      avatarObjectKey: uploaded.key,
    },
    previous,
  );
  if (!updated) {
    await resolvedDependencies.storage
      .deleteObject(uploaded.key)
      .catch(() => {});
    throw new AvatarConflictError();
  }

  let cleanupFailed = false;
  if (
    previous.avatarObjectKey &&
    previous.avatarObjectKey !== uploaded.key &&
    isOwnedAvatarKey(previous.avatarObjectKey, userId)
  ) {
    try {
      await resolvedDependencies.storage.deleteObject(previous.avatarObjectKey);
    } catch {
      cleanupFailed = true;
    }
  }
  return { avatarUrl: uploaded.publicUrl, cleanupFailed };
}

export async function removeProfileAvatar(
  userId: string,
  dependencies?: AvatarServiceDependencies,
): Promise<{
  removed: boolean;
  cleanupFailed: boolean;
  avatarUrl: string | null;
}> {
  const resolvedDependencies = dependencies ?? (await getDependencies());
  const previous = await resolvedDependencies.repository.getAvatar(userId);
  if (!previous)
    return { removed: false, cleanupFailed: false, avatarUrl: null };

  const avatarUrl = previous.avatarObjectKey
    ? externalFallback(previous)
    : null;

  const updated = await resolvedDependencies.repository.setAvatar(
    userId,
    {
      avatarUrl,
      avatarObjectKey: null,
    },
    previous,
  );
  if (!updated) throw new AvatarConflictError();

  let cleanupFailed = false;
  if (
    previous.avatarObjectKey &&
    isOwnedAvatarKey(previous.avatarObjectKey, userId)
  ) {
    try {
      await resolvedDependencies.storage.deleteObject(previous.avatarObjectKey);
    } catch {
      cleanupFailed = true;
    }
  }
  return { removed: true, cleanupFailed, avatarUrl };
}
