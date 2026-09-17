import { getPostAuthDestination } from "@townhawll/auth/onboarding";
import { getOnboardingProfile } from "@townhawll/profile/repository";
import { getInitialOnboardingStep } from "@townhawll/profile/onboarding";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireCurrentVerifiedUser } from "../_lib/current-user";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Get started | TownHawll" };

export default async function OnboardingPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ callbackUrl?: string }>;
}>) {
  const { callbackUrl } = await searchParams;
  const user = await requireCurrentVerifiedUser("/onboarding");
  const record = await getOnboardingProfile(user.id);
  const profile = record?.profile;

  if (profile?.onboardingCompletedAt) {
    redirect(
      getPostAuthDestination(profile.onboardingCompletedAt, callbackUrl),
    );
  }

  const existingAvatarUrl = profile?.avatarUrl ?? null;
  const avatarUrl = isHttpUrl(existingAvatarUrl) ? existingAvatarUrl : null;
  const initialStep = getInitialOnboardingStep(
    profile?.onboardingProfileSavedAt,
  );

  return (
    <main className="mx-auto flex min-h-screen w-[min(100%-2rem,32rem)] flex-col justify-center py-12">
      <p className="mb-8 text-sm font-semibold tracking-wide text-accent">
        TownHawll
      </p>
      <section className="rounded-xl border border-border-default bg-surface-1 p-6 sm:p-8">
        <OnboardingForm
          avatarUrl={avatarUrl}
          initialStep={initialStep}
          initialValues={{
            username: profile?.username ?? "",
            displayName: profile?.displayName ?? record?.name ?? "",
            bio: profile?.bio ?? "",
            contentFocus: profile?.contentFocus ?? null,
          }}
        />
      </section>
    </main>
  );
}

function isHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
