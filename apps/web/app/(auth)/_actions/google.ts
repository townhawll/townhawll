"use server";

import { allowGoogleOAuthStart } from "@townhawll/auth/google";
import { getSafeCallbackUrl } from "@townhawll/auth/redirects";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "../../../auth";
import { getClientIp } from "../_lib/client-ip";

export async function googleSignInAction(formData: FormData) {
  const value = formData.get("callbackUrl");
  const callbackUrl = getSafeCallbackUrl(
    typeof value === "string" ? value : null,
  );

  let allowed = false;
  try {
    allowed = await allowGoogleOAuthStart(getClientIp(await headers()));
  } catch {
    redirect("/login?error=temporarily_unavailable");
  }

  if (!allowed) redirect("/login?error=rate_limited");
  await signIn("google", { redirectTo: callbackUrl });
}
