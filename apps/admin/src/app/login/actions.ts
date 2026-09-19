"use server";

import * as Sentry from "@sentry/nextjs";
import {
  getAuthSessionCookieName,
  getAuthSessionCookieOptions,
} from "@townhawll/auth/cookies";
import {
  allowLogin,
  authenticatePasswordUser,
  emailPasswordLoginSchema,
} from "@townhawll/auth/login";
import { createDatabaseSession } from "@townhawll/auth/session";
import { getStaffRoles } from "@townhawll/auth/staff";
import { resolveStaffAccess } from "@townhawll/auth/staff-context";
import {
  createLogger,
  getOrCreateRequestId,
  withRequestId,
} from "@townhawll/observability";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSafeAdminCallbackUrl } from "@/lib/auth-flow";
import { getClientIp } from "@/lib/client-ip";

export interface AdminLoginActionState {
  error?: string;
  fields?: { email?: string[]; password?: string[] };
}

const INVALID_CREDENTIALS_MESSAGE =
  "The email or password you entered is incorrect.";
const logger = createLogger("admin");

export async function adminLoginAction(
  _previousState: AdminLoginActionState,
  formData: FormData,
): Promise<AdminLoginActionState> {
  const parsed = emailPasswordLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fields: parsed.error.flatten().fieldErrors };

  const callbackValue = formData.get("callbackUrl");
  const callbackUrl = getSafeAdminCallbackUrl(
    typeof callbackValue === "string" ? callbackValue : null,
  );
  const requestHeaders = await headers();
  const requestLogger = withRequestId(
    logger,
    getOrCreateRequestId(requestHeaders),
  );
  let destination = callbackUrl;

  try {
    const allowed = await allowLogin({
      identifier: parsed.data.email,
      ipAddress: getClientIp(requestHeaders),
    });
    if (!allowed) {
      return {
        error: "Too many login attempts. Please wait before trying again.",
      };
    }

    const result = await authenticatePasswordUser({
      identifier: parsed.data.email,
      password: parsed.data.password,
    });
    if (result.status !== "authenticated") {
      return { error: INVALID_CREDENTIALS_MESSAGE };
    }

    const roles = await getStaffRoles(result.user.id);
    const access = resolveStaffAccess({ ...result.user, roles });
    if (access.status !== "authorized") destination = "/403";

    const session = await createDatabaseSession(result.user.id);
    const cookieStore = await cookies();
    cookieStore.set(getAuthSessionCookieName(), session.sessionToken, {
      ...getAuthSessionCookieOptions(),
      expires: session.expires,
    });
  } catch (error) {
    requestLogger.error({ err: error, event: "admin_login_failure" });
    Sentry.captureException(error);
    return { error: "We could not sign you in right now. Please try again." };
  }

  redirect(destination);
}
