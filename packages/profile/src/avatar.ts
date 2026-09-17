import {
  createObjectKey,
  getStorage,
  type ObjectStorage,
} from "@townhawll/storage";
import { validateImageBytes } from "@townhawll/storage/validation";

export interface AvatarRepository {
  getAvatar(userId: string): Promise<{
    avatarUrl: string | null;
    avatarObjectKey: string | null;
  } | null>;
  setAvatar(
    userId: string,
    avatar: { avatarUrl: string | null; avatarObjectKey: string | null },
  ): Promise<boolean>;
}

export function getProfileAvatarUrl(value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith("/api/storage/")) return value;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
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
    async setAvatar(userId, avatar) {
      const result = await db.profile.updateMany({
        where: { userId },
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
  const validated = validateImageBytes(input);
  const resolvedDependencies = dependencies ?? (await getDependencies());
  const previous = await resolvedDependencies.repository.getAvatar(userId);
  const key = createObjectKey({
    prefix: `users/${userId}/avatar`,
    extension: validated.extension,
  });
  const uploaded = await resolvedDependencies.storage.uploadObject({
    key,
    body: validated.bytes,
    contentType: validated.contentType,
    cacheControl: "public, max-age=31536000, immutable",
  });

  try {
    const updated = await resolvedDependencies.repository.setAvatar(userId, {
      avatarUrl: uploaded.publicUrl,
      avatarObjectKey: uploaded.key,
    });
    if (!updated) throw new Error("The profile does not exist.");
  } catch (error) {
    await resolvedDependencies.storage
      .deleteObject(uploaded.key)
      .catch(() => {});
    throw error;
  }

  let cleanupFailed = false;
  if (previous?.avatarObjectKey && previous.avatarObjectKey !== uploaded.key) {
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
): Promise<{ removed: boolean; cleanupFailed: boolean }> {
  const resolvedDependencies = dependencies ?? (await getDependencies());
  const previous = await resolvedDependencies.repository.getAvatar(userId);
  if (!previous) return { removed: false, cleanupFailed: false };

  const updated = await resolvedDependencies.repository.setAvatar(userId, {
    avatarUrl: null,
    avatarObjectKey: null,
  });
  if (!updated) return { removed: false, cleanupFailed: false };

  let cleanupFailed = false;
  if (previous.avatarObjectKey) {
    try {
      await resolvedDependencies.storage.deleteObject(previous.avatarObjectKey);
    } catch {
      cleanupFailed = true;
    }
  }
  return { removed: true, cleanupFailed };
}
