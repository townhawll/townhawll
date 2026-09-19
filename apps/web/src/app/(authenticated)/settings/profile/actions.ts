"use server";

import * as Sentry from "@sentry/nextjs";
import {
  createLogger,
  getOrCreateRequestId,
  withRequestId,
} from "@townhawll/observability";
import { profileDetailsSchema, usernameChangeSchema } from "@townhawll/profile";
import { getPublicProfilePath } from "@townhawll/profile/public-profile";
import {
  changeUsername,
  getEditableProfile,
  updateBasicProfile,
} from "@townhawll/profile/repository";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireCurrentOnboardedUser } from "@/lib/current-user";

const logger = createLogger("web");

export interface ProfileEditActionState {
  error?: string;
  fields?: { displayName?: string[]; bio?: string[] };
}

export interface UsernameChangeActionState {
  error?: string;
  fields?: { username?: string[]; confirmation?: string[] };
}

function getString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function updateProfileAction(
  _previousState: ProfileEditActionState,
  formData: FormData,
): Promise<ProfileEditActionState> {
  const user = await requireCurrentOnboardedUser("/settings/profile");
  const parsed = profileDetailsSchema.safeParse({
    displayName: getString(formData, "displayName"),
    bio: getString(formData, "bio"),
  });
  if (!parsed.success) {
    return { fields: parsed.error.flatten().fieldErrors };
  }

  let result;
  try {
    result = await updateBasicProfile(user.id, parsed.data);
  } catch (error) {
    const requestLogger = withRequestId(
      logger,
      getOrCreateRequestId(await headers()),
    );
    requestLogger.error({
      err: error,
      event: "profile_update_failure",
      userId: user.id,
    });
    Sentry.captureException(error);
    return {
      error: "We could not update your profile right now. Please try again.",
    };
  }

  if (result.status === "profile_missing") {
    return {
      error: "We could not find a completed profile for this account.",
    };
  }

  const profile = await getEditableProfile(user.id);
  if (!profile) {
    return {
      error: "We could not find a completed profile for this account.",
    };
  }

  revalidatePath(getPublicProfilePath(profile.username));
  revalidatePath("/u/[username]", "page");
  revalidatePath("/settings/profile");
  redirect(getPublicProfilePath(profile.username));
}

export async function changeUsernameAction(
  _previousState: UsernameChangeActionState,
  formData: FormData,
): Promise<UsernameChangeActionState> {
  const user = await requireCurrentOnboardedUser("/settings/profile");
  const parsed = usernameChangeSchema.safeParse({
    username: getString(formData, "username"),
    confirmation: getString(formData, "confirmation"),
  });
  if (!parsed.success) {
    return { fields: parsed.error.flatten().fieldErrors };
  }

  let profile;
  let result;
  try {
    profile = await getEditableProfile(user.id);
    if (!profile) {
      return {
        error: "We could not find a completed profile for this account.",
      };
    }
    result = await changeUsername(user.id, parsed.data.username);
  } catch (error) {
    const requestLogger = withRequestId(
      logger,
      getOrCreateRequestId(await headers()),
    );
    requestLogger.error({
      err: error,
      event: "username_change_failure",
      userId: user.id,
    });
    Sentry.captureException(error);
    return {
      error: "We could not change your username right now. Please try again.",
    };
  }

  if (result.status === "username_taken") {
    return { fields: { username: ["This username is already taken."] } };
  }
  if (result.status === "profile_missing") {
    return {
      error: "We could not find a completed profile for this account.",
    };
  }

  revalidatePath(getPublicProfilePath(profile.username));
  revalidatePath(getPublicProfilePath(result.username));
  revalidatePath("/u/[username]", "page");
  revalidatePath("/settings/profile");
  redirect(getPublicProfilePath(result.username));
}
