"use server";

import {
  allowLogin,
  authenticatePasswordUser,
  loginSchema,
} from "@townhawll/auth/login";
import { getSafeCallbackUrl } from "@townhawll/auth/redirects";
import {
  createDatabaseSession,
  getAuthSessionCookieName,
  getAuthSessionCookieOptions,
} from "@townhawll/auth/session";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getClientIp } from "../_lib/client-ip";

export interface LoginActionState {
  error?: string;
  fields?: { identifier?: string[]; password?: string[] };
}

const INVALID_CREDENTIALS_MESSAGE =
  "The username, email, or password you entered is incorrect.";

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { fields: parsed.error.flatten().fieldErrors };

  const callbackValue = formData.get("callbackUrl");
  const callbackUrl = getSafeCallbackUrl(
    typeof callbackValue === "string" ? callbackValue : null,
  );
  let requiresVerification = false;

  try {
    const allowed = await allowLogin({
      identifier: parsed.data.identifier,
      ipAddress: getClientIp(await headers()),
    });

    if (!allowed) {
      return {
        error: "Too many login attempts. Please wait before trying again.",
      };
    }

    const result = await authenticatePasswordUser(parsed.data);
    if (result.status === "unverified") {
      requiresVerification = true;
    } else if (result.status !== "authenticated") {
      return { error: INVALID_CREDENTIALS_MESSAGE };
    } else {
      // Auth.js Credentials is JWT-only. This record uses the database-session
      // format already consumed by the configured Auth.js adapter and auth().
      const session = await createDatabaseSession(result.user.id);
      const cookieStore = await cookies();
      cookieStore.set(getAuthSessionCookieName(), session.sessionToken, {
        ...getAuthSessionCookieOptions(),
        expires: session.expires,
      });
    }
  } catch {
    return {
      error: "We could not sign you in right now. Please try again.",
    };
  }

  if (requiresVerification) redirect("/check-email?reason=unverified");
  redirect(callbackUrl);
}
