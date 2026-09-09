import { getSafeCallbackUrl } from "@townhawll/auth/redirects";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "../../../auth";
import { GoogleAuthButton } from "../_components/google-auth-button";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in | TownHawll" };

export default async function LoginPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    callbackUrl?: string;
    error?: string;
    reset?: string;
  }>;
}>) {
  const {
    callbackUrl: requestedCallbackUrl,
    error,
    reset,
  } = await searchParams;
  const callbackUrl = getSafeCallbackUrl(requestedCallbackUrl);
  const session = await auth();

  if (
    session?.user.emailVerified &&
    (session.user.status === "ACTIVE" || session.user.status === "RESTRICTED")
  ) {
    redirect(callbackUrl);
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm leading-6 text-foreground-secondary">
        Sign in to continue to TownHawll.
      </p>
      {reset === "success" ? (
        <p
          className="mt-4 rounded-md bg-success/10 p-3 text-sm text-success"
          role="status"
        >
          Your password has been reset. Sign in with your new password.
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-4 rounded-md bg-danger/10 p-3 text-sm text-danger"
          role="alert"
        >
          We could not continue with Google. Please try again.
        </p>
      ) : null}
      <GoogleAuthButton callbackUrl={callbackUrl} />
      <LoginForm callbackUrl={callbackUrl} />
    </>
  );
}
