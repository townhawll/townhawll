import { buttonVariants } from "@townhawll/ui";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Verification link unavailable | TownHawll",
};

export default async function VerificationErrorPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ reason?: string }> }>) {
  const { reason } = await searchParams;
  const expired = reason === "expired";
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {expired
          ? "Verification link expired"
          : "Verification link unavailable"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-foreground-secondary">
        {expired
          ? "Request a new link to finish verifying your account."
          : "This link is invalid or has already been used."}
      </p>
      <Link className={`${buttonVariants()} mt-6 w-full`} href="/check-email">
        Request a new link
      </Link>
    </>
  );
}
