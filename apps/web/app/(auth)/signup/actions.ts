"use server";

import {
  allowSignup,
  registerPasswordUser,
  signupSchema,
} from "@townhawll/auth/signup";
import { getApplicationUrl, sendVerificationEmail } from "@townhawll/email";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getClientIp } from "../_lib/client-ip";

export interface SignupActionState {
  error?: string;
  fields?: { email?: string[]; password?: string[]; username?: string[] };
}

export async function signupAction(
  _previousState: SignupActionState,
  formData: FormData,
): Promise<SignupActionState> {
  let deliveryFailed = false;
  const parsed = signupSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { fields: parsed.error.flatten().fieldErrors };

  try {
    const allowed = await allowSignup({
      ipAddress: getClientIp(await headers()),
      email: parsed.data.email,
    });
    if (!allowed)
      return {
        error: "Too many signup attempts. Please wait before trying again.",
      };

    const registration = await registerPasswordUser(parsed.data);
    if (registration.status === "created") {
      try {
        const verificationUrl = new URL(
          "/verify-email/confirm",
          getApplicationUrl(),
        );
        verificationUrl.searchParams.set("token", registration.token);
        await sendVerificationEmail({
          email: registration.email,
          verificationUrl: verificationUrl.toString(),
          idempotencyKey: `email-verification/${registration.tokenHash}`,
        });
      } catch {
        // The durable token remains available for a safe resend attempt.
        deliveryFailed = true;
      }
    }
  } catch {
    return {
      error: "We could not create your account right now. Please try again.",
    };
  }

  redirect(deliveryFailed ? "/check-email?delivery=failed" : "/check-email");
}
