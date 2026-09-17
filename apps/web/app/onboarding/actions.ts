"use server";

import * as Sentry from "@sentry/nextjs";
import {
  onboardingFocusSchema,
  onboardingProfileSchema,
} from "@townhawll/profile";
import {
  completeOnboarding,
  saveOnboardingProfile,
} from "@townhawll/profile/repository";
import { getContentFocusDestination } from "@townhawll/profile/onboarding";
import {
  createLogger,
  getOrCreateRequestId,
  withRequestId,
} from "@townhawll/observability";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireCurrentVerifiedUser } from "../_lib/current-user";

const logger = createLogger("web");

export interface OnboardingProfileActionState {
  error?: string;
  fields?: { username?: string[]; displayName?: string[]; bio?: string[] };
  saved?: boolean;
  version: number;
  values?: { username: string; displayName: string; bio: string };
}

export interface OnboardingFocusActionState {
  error?: string;
  fields?: { contentFocus?: string[] };
}

function getString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function logUnexpectedFailure(event: string, error: unknown) {
  const requestLogger = withRequestId(
    logger,
    getOrCreateRequestId(await headers()),
  );
  requestLogger.error({ err: error, event });
  Sentry.captureException(error);
}

export async function saveOnboardingProfileAction(
  previousState: OnboardingProfileActionState,
  formData: FormData,
): Promise<OnboardingProfileActionState> {
  const user = await requireCurrentVerifiedUser("/onboarding");
  const values = {
    username: getString(formData, "username"),
    displayName: getString(formData, "displayName"),
    bio: getString(formData, "bio"),
  };
  const parsed = onboardingProfileSchema.safeParse(values);
  if (!parsed.success) {
    return {
      fields: parsed.error.flatten().fieldErrors,
      values,
      version: previousState.version,
    };
  }

  let result;
  try {
    result = await saveOnboardingProfile(user.id, parsed.data);
  } catch (error) {
    await logUnexpectedFailure("onboarding_profile_failure", error);
    return {
      error: "We could not save your profile right now. Please try again.",
      values,
      version: previousState.version,
    };
  }
  if (result === "username_taken") {
    return {
      fields: { username: ["This username is already taken."] },
      values,
      version: previousState.version,
    };
  }
  if (result === "already_completed") redirect("/settings/profile");
  return {
    saved: true,
    values: parsed.data,
    version: previousState.version + 1,
  };
}

export async function completeOnboardingAction(
  _previousState: OnboardingFocusActionState,
  formData: FormData,
): Promise<OnboardingFocusActionState> {
  const user = await requireCurrentVerifiedUser("/onboarding");
  const parsed = onboardingFocusSchema.safeParse({
    contentFocus: formData.get("contentFocus"),
  });
  if (!parsed.success) {
    return { fields: parsed.error.flatten().fieldErrors };
  }

  let result;
  try {
    result = await completeOnboarding(user.id, parsed.data.contentFocus);
  } catch (error) {
    await logUnexpectedFailure("onboarding_completion_failure", error);
    return {
      error: "We could not finish onboarding right now. Please try again.",
    };
  }

  if (result === "profile_incomplete") {
    return {
      error: "Save your profile before choosing your TownHawll.",
    };
  }
  if (result === "already_completed") redirect("/settings/profile");

  const intendedDestination = getContentFocusDestination(
    parsed.data.contentFocus,
  );
  // Games and Screen landing pages arrive in later build steps.
  redirect(intendedDestination === "/" ? intendedDestination : "/");
}
