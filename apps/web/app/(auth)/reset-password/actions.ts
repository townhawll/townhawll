"use server";

import {
  allowPasswordResetAttempt,
  resetPassword,
  resetPasswordSchema,
  type PasswordResetResult,
} from "@townhawll/auth/password-reset";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getClientIp } from "../_lib/client-ip";

export interface ResetPasswordActionState {
  error?: string;
  fields?: {
    confirmPassword?: string[];
    password?: string[];
    token?: string[];
  };
}

export async function resetPasswordAction(
  _previousState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const parsed = resetPasswordSchema.safeParse({
    confirmPassword: formData.get("confirmPassword"),
    password: formData.get("password"),
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return { fields: parsed.error.flatten().fieldErrors };
  }

  let result: PasswordResetResult;
  try {
    const allowed = await allowPasswordResetAttempt({
      ipAddress: getClientIp(await headers()),
      token: parsed.data.token,
    });
    if (!allowed) {
      return {
        error: "Too many reset attempts. Please wait before trying again.",
      };
    }

    result = await resetPassword(parsed.data);
  } catch {
    return {
      error: "We could not reset your password right now. Please try again.",
    };
  }

  if (result.status !== "reset") {
    return {
      error:
        result.status === "expired"
          ? "This password reset link has expired. Request a new one."
          : "This password reset link is invalid or has already been used.",
    };
  }

  redirect("/login?reset=success");
}
