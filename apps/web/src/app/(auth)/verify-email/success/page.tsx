import { buttonVariants } from "@townhawll/ui";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Email verified | TownHawll" };

export default function VerificationSuccessPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Email verified</h1>
      <p className="mt-2 text-sm leading-6 text-foreground-secondary">
        Your account is ready. Sign in to continue to TownHawll.
      </p>
      <Link className={`${buttonVariants()} mt-6 w-full`} href="/login">
        Sign in
      </Link>
    </>
  );
}
