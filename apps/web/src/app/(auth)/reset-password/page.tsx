import { getPasswordResetTokenStatus } from "@townhawll/auth/password-reset";
import { buttonVariants } from "@townhawll/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  referrer: "no-referrer",
  title: "Reset password | TownHawll",
};

export default async function ResetPasswordPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ token?: string }> }>) {
  const { token } = await searchParams;
  const status = token
    ? await getPasswordResetTokenStatus(token)
    : ("invalid" as const);

  if (status !== "valid" || !token) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">
          {status === "expired"
            ? "Reset link expired"
            : "Reset link unavailable"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-foreground-secondary">
          {status === "expired"
            ? "Request a new link to reset your password."
            : "This link is invalid or has already been used."}
        </p>
        <Link
          className={`${buttonVariants()} mt-6 w-full`}
          href="/forgot-password"
        >
          Request a new link
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Choose a new password
      </h1>
      <p className="mt-2 text-sm leading-6 text-foreground-secondary">
        Your new password will sign out all existing sessions.
      </p>
      <ResetPasswordForm token={token} />
    </>
  );
}
