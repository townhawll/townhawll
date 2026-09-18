import { needsOnboarding } from "@townhawll/profile/onboarding";

import { getSafeCallbackUrl } from "./redirects.ts";

export function getPostAuthDestination(
  completedAt: Date | null | undefined,
  callbackUrl: string | null | undefined,
): string {
  const destination = getSafeCallbackUrl(callbackUrl);
  const path = destination.split(/[?#]/, 1)[0];

  if (!needsOnboarding(completedAt)) {
    return path === "/onboarding" ? "/settings/profile" : destination;
  }

  if (path === "/onboarding") return "/onboarding";
  const url = new URL("https://townhawll.invalid/onboarding");
  url.searchParams.set("callbackUrl", destination);
  return `${url.pathname}${url.search}`;
}
