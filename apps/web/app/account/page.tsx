import { getSafeCallbackUrl } from "@townhawll/auth/redirects";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireCurrentOnboardedUser } from "../_lib/current-user";

export const metadata: Metadata = {
  title: "TownHawll",
  robots: { index: false, follow: false },
};

/** Temporary migration route for bookmarks and older OAuth links. */
export default async function LegacyAccountRedirect({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ callbackUrl?: string }>;
}>) {
  const { callbackUrl } = await searchParams;
  const requestedDestination = getSafeCallbackUrl(callbackUrl);
  const destination =
    requestedDestination.split(/[?#]/, 1)[0] === "/account"
      ? "/settings/profile"
      : requestedDestination;

  await requireCurrentOnboardedUser(destination);
  redirect(destination);
}
