import {
  onboardingFocusSchema,
  onboardingProfileSchema,
  profileDetailsSchema,
  usernameSchema,
  type OnboardingProfileInput,
  type ProfileDetailsInput,
} from "./index.ts";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function getOnboardingProfile(userId: string) {
  const { db } = await import("@townhawll/db");
  return db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      profile: {
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          contentFocus: true,
          onboardingProfileSavedAt: true,
          onboardingCompletedAt: true,
        },
      },
    },
  });
}

export async function getOnboardingCompletedAt(userId: string) {
  const { db } = await import("@townhawll/db");
  const profile = await db.profile.findUnique({
    where: { userId },
    select: { onboardingCompletedAt: true },
  });
  return profile?.onboardingCompletedAt ?? null;
}

export interface EditableProfile {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
}

export async function getEditableProfile(
  userId: string,
): Promise<EditableProfile | null> {
  const { db } = await import("@townhawll/db");
  const profile = await db.profile.findUnique({
    where: { userId },
    select: {
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
    },
  });

  if (!profile?.username || !profile.displayName) return null;
  return {
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
  };
}

interface ProfileOwnerRecord {
  userId: string;
}

export interface BasicProfileRepository {
  updateForUser(userId: string, input: ProfileDetailsInput): Promise<boolean>;
}

async function createBasicProfileRepository(): Promise<BasicProfileRepository> {
  const { db } = await import("@townhawll/db");

  return {
    async updateForUser(userId, input) {
      const updated = await db.profile.updateMany({
        where: { userId, onboardingCompletedAt: { not: null } },
        data: {
          displayName: input.displayName,
          bio: input.bio || null,
        },
      });
      return updated.count === 1;
    },
  };
}

export type UpdateBasicProfileResult =
  { status: "saved" } | { status: "profile_missing" };

export async function updateBasicProfile(
  userId: string,
  input: ProfileDetailsInput,
  repository?: BasicProfileRepository,
): Promise<UpdateBasicProfileResult> {
  const parsed = profileDetailsSchema.parse(input);
  const resolvedRepository =
    repository ?? (await createBasicProfileRepository());

  const updated = await resolvedRepository.updateForUser(userId, parsed);
  return updated ? { status: "saved" } : { status: "profile_missing" };
}

export interface UsernameChangeRepository {
  findByUsername(username: string): Promise<ProfileOwnerRecord | null>;
  updateUsername(userId: string, username: string): Promise<boolean>;
}

async function createUsernameChangeRepository(): Promise<UsernameChangeRepository> {
  const { db } = await import("@townhawll/db");

  return {
    findByUsername(username) {
      return db.profile.findUnique({
        where: { username },
        select: { userId: true },
      });
    },
    async updateUsername(userId, username) {
      const updated = await db.profile.updateMany({
        where: { userId, onboardingCompletedAt: { not: null } },
        data: { username },
      });
      return updated.count === 1;
    },
  };
}

export type ChangeUsernameResult =
  | { status: "changed"; username: string }
  | { status: "username_taken" }
  | { status: "profile_missing" };

export async function changeUsername(
  userId: string,
  username: string,
  repository?: UsernameChangeRepository,
): Promise<ChangeUsernameResult> {
  const normalizedUsername = usernameSchema.parse(username);
  const resolvedRepository =
    repository ?? (await createUsernameChangeRepository());
  const occupant = await resolvedRepository.findByUsername(normalizedUsername);
  if (occupant && occupant.userId !== userId) {
    return { status: "username_taken" };
  }

  try {
    const updated = await resolvedRepository.updateUsername(
      userId,
      normalizedUsername,
    );
    return updated
      ? { status: "changed", username: normalizedUsername }
      : { status: "profile_missing" };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: "username_taken" };
    }
    throw error;
  }
}

export type SaveOnboardingProfileResult =
  "saved" | "username_taken" | "already_completed";

export async function saveOnboardingProfile(
  userId: string,
  input: OnboardingProfileInput,
): Promise<SaveOnboardingProfileResult> {
  const parsed = onboardingProfileSchema.parse(input);
  const { db } = await import("@townhawll/db");
  const existing = await db.profile.findUnique({
    where: { username: parsed.username },
    select: { userId: true },
  });
  if (existing && existing.userId !== userId) return "username_taken";

  const current = await db.user.findUnique({
    where: { id: userId },
    select: {
      image: true,
      profile: { select: { onboardingCompletedAt: true } },
    },
  });
  if (current?.profile?.onboardingCompletedAt) return "already_completed";

  const data = {
    username: parsed.username,
    displayName: parsed.displayName,
    bio: parsed.bio || null,
    onboardingProfileSavedAt: new Date(),
  };

  try {
    if (current?.profile) {
      const updated = await db.profile.updateMany({
        where: { userId, onboardingCompletedAt: null },
        data,
      });
      if (updated.count === 0) return "already_completed";
    } else {
      // The usual auth flows create Profile; handle an older user without one.
      await db.profile.create({ data: { userId, ...data } });
    }
    return "saved";
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const occupant = await db.profile.findUnique({
        where: { username: parsed.username },
        select: { userId: true },
      });
      if (occupant && occupant.userId !== userId) return "username_taken";
    }
    throw error;
  }
}

export type CompleteOnboardingResult =
  "completed" | "profile_incomplete" | "already_completed";

export async function completeOnboarding(
  userId: string,
  contentFocus: unknown,
): Promise<CompleteOnboardingResult> {
  const parsed = onboardingFocusSchema.parse({ contentFocus });
  const { db } = await import("@townhawll/db");
  const completed = await db.profile.updateMany({
    where: {
      userId,
      username: { not: null },
      displayName: { not: null },
      onboardingProfileSavedAt: { not: null },
      onboardingCompletedAt: null,
    },
    data: {
      contentFocus: parsed.contentFocus,
      onboardingCompletedAt: new Date(),
    },
  });
  if (completed.count === 1) return "completed";

  const profile = await db.profile.findUnique({
    where: { userId },
    select: { onboardingCompletedAt: true },
  });
  return profile?.onboardingCompletedAt
    ? "already_completed"
    : "profile_incomplete";
}
