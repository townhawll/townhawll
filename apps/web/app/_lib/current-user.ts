import {
  AccountUnavailableError,
  EmailVerificationRequiredError,
  getLoginUrl,
  requireUser,
  requireVerifiedUser,
} from "@townhawll/auth";
import {
  endDatabaseSession,
  getAuthSessionCookieName,
} from "@townhawll/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "../../auth";

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session === null ? null : requireUser(session);
}

export async function getCurrentSession() {
  return auth();
}

export async function requireCurrentUser(callbackUrl: string) {
  const session = await getCurrentSession();

  if (session === null) {
    redirect(getLoginUrl(callbackUrl));
  }

  try {
    return requireUser(session);
  } catch (error) {
    if (error instanceof AccountUnavailableError) {
      await clearCurrentSession();
      redirect(getLoginUrl(callbackUrl));
    }

    throw error;
  }
}

export async function requireCurrentVerifiedUser(callbackUrl: string) {
  const session = await getCurrentSession();

  if (session === null) {
    redirect(getLoginUrl(callbackUrl));
  }

  try {
    return requireVerifiedUser(session);
  } catch (error) {
    if (error instanceof EmailVerificationRequiredError) {
      redirect("/check-email?reason=unverified");
    }

    if (error instanceof AccountUnavailableError) {
      await clearCurrentSession();
      redirect(getLoginUrl(callbackUrl));
    }

    throw error;
  }
}

async function clearCurrentSession() {
  const cookieStore = await cookies();
  const cookieName = getAuthSessionCookieName();
  await endDatabaseSession(cookieStore.get(cookieName)?.value);
  cookieStore.delete(cookieName);
}
