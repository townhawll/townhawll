import { getProfileAvatarUrl } from "@townhawll/profile/avatar";
import {
  getPublicProfilePath,
  getPublicProfileByUsername,
  isCanonicalProfileUsername,
  isProfileOwner,
} from "@townhawll/profile/public-profile";
import { Avatar, buttonVariants } from "@townhawll/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { getCurrentSession } from "@/lib/current-user";

const getProfile = cache(getPublicProfileByUsername);

interface PublicProfilePageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: PublicProfilePageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(username);

  if (!profile) {
    return {
      title: "Profile not found — TownHawll",
      robots: { index: false, follow: false },
    };
  }

  const description = profile.bio?.trim()
    ? profile.bio.trim().slice(0, 160)
    : `View ${profile.displayName}'s profile on TownHawll.`;

  return {
    title: `${profile.displayName} (@${profile.username}) — TownHawll`,
    description,
    alternates: { canonical: `/u/${profile.username}` },
  };
}

export default async function PublicProfilePage({
  params,
}: PublicProfilePageProps) {
  const { username: requestedUsername } = await params;
  const profile = await getProfile(requestedUsername);
  if (!profile) notFound();

  if (!isCanonicalProfileUsername(requestedUsername, profile.username)) {
    permanentRedirect(getPublicProfilePath(profile.username));
  }

  const session = await getCurrentSession();
  const owner = isProfileOwner(profile.userId, session?.user.id);
  const avatarUrl = getProfileAvatarUrl(profile.avatarUrl);

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-[min(100%-2rem,64rem)] py-6 sm:py-10">
        <Link
          className="inline-flex rounded-sm text-sm font-semibold tracking-wide text-accent hover:text-accent-hover focus-visible:outline-none"
          href="/"
        >
          TownHawll
        </Link>

        <article className="mt-10">
          <header className="flex flex-col gap-6 border-b border-border-subtle pb-8 sm:flex-row sm:items-start">
            <Avatar
              alt={`${profile.displayName}'s avatar`}
              className="size-24 rounded-xl border border-border-default text-8xl sm:size-28"
              fallback={profile.displayName}
              src={avatarUrl}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="break-words text-3xl font-semibold tracking-tight">
                    {profile.displayName}
                  </h1>
                  <p className="mt-1 break-all text-sm text-foreground-muted">
                    @{profile.username}
                  </p>
                </div>

                {owner ? (
                  <div className="shrink-0">
                    <Link
                      className={buttonVariants({ variant: "secondary" })}
                      href="/settings/profile"
                    >
                      Edit profile
                    </Link>
                  </div>
                ) : null}
              </div>

              {profile.bio ? (
                <p className="mt-5 max-w-2xl whitespace-pre-wrap break-words text-sm leading-6 text-foreground-secondary sm:text-base">
                  {profile.bio}
                </p>
              ) : null}

              <p className="mt-5 text-sm text-foreground-muted">
                Joined {formatJoinedDate(profile.joinedAt)}
              </p>
            </div>
          </header>
        </article>
      </div>
    </main>
  );
}

function formatJoinedDate(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
