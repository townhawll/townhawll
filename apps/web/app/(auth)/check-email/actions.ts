"use server";

import {
  allowVerificationResend,
  replaceVerificationToken,
  verificationResendSchema,
} from "@townhawll/auth/signup";
import { getApplicationUrl, sendVerificationEmail } from "@townhawll/email";
import { headers } from "next/headers";

import { getClientIp } from "../_lib/client-ip";

export interface ResendActionState {
  message?: string;
}

const GENERIC_RESEND_MESSAGE =
  "If an unverified account exists for that email, a new link will arrive shortly.";

export async function resendVerificationAction(
  _previousState: ResendActionState,
  formData: FormData,
): Promise<ResendActionState> {
  const parsed = verificationResendSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) return { message: GENERIC_RESEND_MESSAGE };

  try {
    const allowed = await allowVerificationResend({
      ipAddress: getClientIp(await headers()),
      email: parsed.data.email,
    });
    if (!allowed) return { message: GENERIC_RESEND_MESSAGE };

    const replacement = await replaceVerificationToken(parsed.data.email);
    if (replacement) {
      const verificationUrl = new URL(
        "/verify-email/confirm",
        getApplicationUrl(),
      );
      verificationUrl.searchParams.set("token", replacement.token);
      await sendVerificationEmail({
        email: replacement.email,
        verificationUrl: verificationUrl.toString(),
        idempotencyKey: `email-verification/${replacement.tokenHash}`,
      });
    }
  } catch {
    // Keep provider, account, and rate-limit state private.
  }

  return { message: GENERIC_RESEND_MESSAGE };
}
