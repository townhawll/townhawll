import type { Metadata } from "next";
import { ResendForm } from "./resend-form";

export const metadata: Metadata = { title: "Check your email | TownHawll" };

export default async function CheckEmailPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ delivery?: string; reason?: string }>;
}>) {
  const { delivery, reason } = await searchParams;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Check your email
      </h1>
      <p className="mt-2 text-sm leading-6 text-foreground-secondary">
        {reason === "unverified"
          ? "Verify your email before signing in. You can request a new link below."
          : "If we can create an account with those details, we’ll send a verification link. The link expires after 24 hours."}
      </p>
      {delivery === "failed" ? (
        <p
          className="mt-4 rounded-md bg-warning/10 p-3 text-sm text-warning"
          role="alert"
        >
          Your account was created, but the verification email could not be
          delivered. Check the email provider configuration, then request a new
          link below.
        </p>
      ) : null}
      <div className="mt-6 border-t border-border-subtle pt-6">
        <h2 className="text-sm font-semibold">Need another link?</h2>
        <ResendForm />
      </div>
    </>
  );
}
