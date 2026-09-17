import { usernameSchema } from "./index.ts";

export interface PublicProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  joinedAt: Date;
}

interface PublicProfileRecord {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  user: { createdAt: Date };
}

export interface PublicProfileRepository {
  findByUsername(username: string): Promise<PublicProfileRecord | null>;
}

async function createPublicProfileRepository(): Promise<PublicProfileRepository> {
  const { db } = await import("@townhawll/db");

  return {
    findByUsername(username) {
      return db.profile.findFirst({
        where: {
          username,
          onboardingCompletedAt: { not: null },
          user: { status: { in: ["ACTIVE", "RESTRICTED"] } },
        },
        select: {
          userId: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          user: { select: { createdAt: true } },
        },
      });
    },
  };
}

export async function getPublicProfileByUsername(
  requestedUsername: string,
  repository?: PublicProfileRepository,
): Promise<PublicProfile | null> {
  const parsed = usernameSchema.safeParse(requestedUsername);
  if (!parsed.success) return null;

  const resolvedRepository =
    repository ?? (await createPublicProfileRepository());
  const record = await resolvedRepository.findByUsername(parsed.data);
  if (!record?.username || !record.displayName) return null;

  return {
    userId: record.userId,
    username: record.username,
    displayName: record.displayName,
    avatarUrl: record.avatarUrl,
    bio: record.bio,
    joinedAt: record.user.createdAt,
  };
}

export function isCanonicalProfileUsername(
  requestedUsername: string,
  storedUsername: string,
): boolean {
  return requestedUsername === storedUsername;
}

export function isProfileOwner(
  profileUserId: string,
  viewerUserId: string | null | undefined,
): boolean {
  return profileUserId === viewerUserId;
}

export function getPublicProfilePath(username: string): string {
  return `/u/${encodeURIComponent(username)}`;
}
