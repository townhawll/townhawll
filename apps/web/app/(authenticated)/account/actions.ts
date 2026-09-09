"use server";

import { getSafeCallbackUrl } from "@townhawll/auth/redirects";
import {
  endDatabaseSession,
  getAuthSessionCookieName,
} from "@townhawll/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function logoutAction(formData: FormData) {
  const value = formData.get("callbackUrl");
  const callbackUrl = getSafeCallbackUrl(
    typeof value === "string" ? value : null,
    "/",
  );

  const cookieStore = await cookies();
  const cookieName = getAuthSessionCookieName();
  await endDatabaseSession(cookieStore.get(cookieName)?.value);
  cookieStore.delete(cookieName);
  redirect(callbackUrl);
}
