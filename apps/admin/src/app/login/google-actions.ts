"use server";

import { allowGoogleOAuthStart } from "@townhawll/auth/google";
import { getAuthSessionCookieName } from "@townhawll/auth/cookies";
import { endDatabaseSession } from "@townhawll/auth/session";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";
import { getSafeAdminCallbackUrl } from "@/lib/auth-flow";
import { getClientIp } from "@/lib/client-ip";

export async function adminGoogleSignInAction(formData: FormData) {
  const value = formData.get("callbackUrl");
  const callbackUrl = getSafeAdminCallbackUrl(
    typeof value === "string" ? value : null,
  );

  let allowed = false;
  try {
    allowed = await allowGoogleOAuthStart(getClientIp(await headers()));
  } catch {
    redirect("/login?error=temporarily_unavailable");
  }

  if (!allowed) redirect("/login?error=rate_limited");

  // Start admin OAuth without an existing session so Auth.js resolves and
  // links only the verified Google identity selected for this login attempt.
  const cookieStore = await cookies();
  const cookieName = getAuthSessionCookieName();
  await endDatabaseSession(cookieStore.get(cookieName)?.value);
  cookieStore.delete(cookieName);

  await signIn("google", { redirectTo: callbackUrl });
}
