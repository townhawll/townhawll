import { Badge } from "@townhawll/ui";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  getAdminLoginDestination,
  getSafeAdminCallbackUrl,
} from "@/lib/auth-flow";
import { getCurrentStaffState } from "@/lib/current-staff";
import { AdminGoogleAuthButton } from "./google-auth-button";
import { AdminLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign in | TownHawll" };

export default async function AdminLoginPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}>) {
  const { callbackUrl: requestedCallbackUrl, error } = await searchParams;
  const callbackUrl = getSafeAdminCallbackUrl(requestedCallbackUrl);
  const destination = getAdminLoginDestination(
    await getCurrentStaffState(),
    callbackUrl,
  );
  if (destination) redirect(destination);

  return (
    <main className="mx-auto grid min-h-screen w-[min(100%-2rem,25rem)] content-center py-12">
      <section className="rounded-lg border border-border-default bg-surface-1 p-6 sm:p-8">
        <Badge>TownHawll Admin</Badge>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          Staff sign in
        </h1>
        <p className="mt-2 text-sm leading-6 text-foreground-secondary">
          Use your verified TownHawll staff account.
        </p>
        {error ? (
          <p
            className="mt-4 rounded-md bg-danger/10 p-3 text-sm text-danger"
            role="alert"
          >
            We could not complete Google sign-in for this admin account.
          </p>
        ) : null}
        <AdminGoogleAuthButton callbackUrl={callbackUrl} />
        <AdminLoginForm callbackUrl={callbackUrl} />
      </section>
    </main>
  );
}
