import { getProfileAvatarUrl } from "@townhawll/profile/avatar";
import { getPublicProfilePath } from "@townhawll/profile/public-profile";
import { getEditableProfile } from "@townhawll/profile/repository";
import { getSafeCallbackUrl } from "@townhawll/auth/redirects";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireCurrentOnboardedUser } from "../../../_lib/current-user";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "Edit profile — TownHawll",
  robots: { index: false, follow: false },
};

export default async function ProfileSettingsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ callbackUrl?: string }>;
}>) {
  const { callbackUrl } = await searchParams;
  const destination = getSafeCallbackUrl(callbackUrl);
  const user = await requireCurrentOnboardedUser(destination);
  const destinationPath = destination.split(/[?#]/, 1)[0];
  if (
    destinationPath !== "/settings/profile" &&
    destinationPath !== "/onboarding"
  ) {
    redirect(destination);
  }
  const profile = await getEditableProfile(user.id);
  if (!profile) notFound();

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-[min(100%-2rem,42rem)] py-6 sm:py-10">
        <Link
          className="inline-flex rounded-sm text-sm font-semibold tracking-wide text-accent hover:text-accent-hover focus-visible:outline-none"
          href={getPublicProfilePath(profile.username)}
        >
          Back to profile
        </Link>

        <header className="mt-8 border-b border-border-subtle pb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
          <p className="mt-2 text-sm leading-6 text-foreground-secondary">
            Update the public identity people see across TownHawll.
          </p>
        </header>

        <section aria-labelledby="profile-details-heading" className="py-8">
          <h2 className="sr-only" id="profile-details-heading">
            Profile details
          </h2>
          <ProfileForm
            initialAvatarUrl={getProfileAvatarUrl(profile.avatarUrl)}
            initialValues={{
              username: profile.username,
              displayName: profile.displayName,
              bio: profile.bio ?? "",
            }}
          />
        </section>
      </div>
    </main>
  );
}
