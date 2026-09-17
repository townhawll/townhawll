import {
  onboardingFocusSchema,
  onboardingProfileSchema,
  type OnboardingProfileInput,
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
