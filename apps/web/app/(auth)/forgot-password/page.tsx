import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset password | TownHawll" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Reset your password
      </h1>
      <p className="mt-2 text-sm leading-6 text-foreground-secondary">
        Enter your account email and we’ll send you a secure reset link.
      </p>
      <ForgotPasswordForm />
      <Link
        className="mt-5 block text-center text-sm font-medium text-accent hover:text-accent-hover"
        href="/login"
      >
        Back to sign in
      </Link>
    </>
  );
}
