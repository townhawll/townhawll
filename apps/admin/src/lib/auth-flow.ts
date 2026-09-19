import { getSafeCallbackUrl } from "@townhawll/auth/redirects";
import type { StaffAccessState } from "@townhawll/auth/staff-context";

export const ADMIN_DEFAULT_DESTINATION = "/dashboard";

export function getSafeAdminCallbackUrl(
  value: string | null | undefined,
): string {
  const callbackUrl = getSafeCallbackUrl(value, ADMIN_DEFAULT_DESTINATION);
  return callbackUrl === "/login" || callbackUrl.startsWith("/login?")
    ? ADMIN_DEFAULT_DESTINATION
    : callbackUrl;
}

export function getAdminRootDestination(
  state: StaffAccessState,
): "/403" | "/dashboard" | "/login" {
  if (state.status === "unauthenticated") return "/login";
  if (state.status === "forbidden") return "/403";
  return ADMIN_DEFAULT_DESTINATION;
}

export function getAdminLoginDestination(
  state: StaffAccessState,
  callbackUrl: string | null | undefined,
): string | null {
  if (state.status === "unauthenticated") return null;
  if (state.status === "forbidden") return "/403";
  return getSafeAdminCallbackUrl(callbackUrl);
}
