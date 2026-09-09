"use server";

import {
  allowPasswordResetRequest,
  createPasswordResetRequest,
  forgotPasswordSchema,
} from "@townhawll/auth/password-reset";
import { getApplicationUrl, sendPasswordResetEmail } from "@townhawll/email";
import { headers } from "next/headers";

import { getClientIp } from "../_lib/client-ip";

export interface ForgotPasswordActionState {
  fields?: { email?: string[] };
  message?: string;
}

const GENERIC_RESPONSE =
  "If an account exists for that email, a password reset link will arrive shortly.";

export async function forgotPasswordAction(
  _previousState: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { fields: parsed.error.flatten().fieldErrors };
  }

  try {
    const allowed = await allowPasswordResetRequest({
      email: parsed.data.email,
      ipAddress: getClientIp(await headers()),
    });

    if (allowed) {
      const request = await createPasswordResetRequest(parsed.data);
      if (request) {
        const resetUrl = new URL("/reset-password", getApplicationUrl());
        resetUrl.searchParams.set("token", request.token);
        await sendPasswordResetEmail({
          email: request.email,
          idempotencyKey: `password-reset/${request.tokenHash}`,
          resetUrl: resetUrl.toString(),
        });
      }
    }
  } catch {
    // Account, rate-limit, and provider state must remain private.
  }

  return { message: GENERIC_RESPONSE };
}
