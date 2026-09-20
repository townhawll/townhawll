"use server";

import { getAuthSessionCookieName } from "@townhawll/auth/cookies";
import { endDatabaseSession } from "@townhawll/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function adminLogoutAction() {
  const cookieStore = await cookies();
  const cookieName = getAuthSessionCookieName();
  await endDatabaseSession(cookieStore.get(cookieName)?.value);
  cookieStore.delete(cookieName);
  redirect("/login");
}
