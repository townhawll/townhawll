import { loadAppEnvironment } from "@townhawll/config/server-env";
import { Button, buttonVariants } from "@townhawll/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentStaffState } from "@/lib/current-staff";
import { adminLogoutAction } from "@/app/_actions/logout";

export const metadata: Metadata = { title: "Access denied | TownHawll Admin" };

export default async function ForbiddenPage() {
  const state = await getCurrentStaffState();
  if (state.status === "unauthenticated") {
    redirect("/login?callbackUrl=%2Fdashboard");
  }
  const { APP_URL: publicAppUrl } = loadAppEnvironment();

  return (
    <main className="mx-auto grid min-h-screen w-[min(100%-2rem,38rem)] content-center gap-3 py-12">
      <p className="text-sm font-semibold text-accent">403</p>
      <h1 className="text-3xl font-semibold tracking-tight">Access denied</h1>
      <p className="max-w-xl text-sm leading-6 text-foreground-secondary">
        You do not have permission to access this admin area.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {state.status === "authorized" ? (
          <Link className={buttonVariants({ size: "sm" })} href="/dashboard">
            Back to Dashboard
          </Link>
        ) : null}
        <a
          className={buttonVariants({ size: "sm", variant: "secondary" })}
          href={publicAppUrl}
        >
          Back to TownHawll
        </a>
      </div>
      <form action={adminLogoutAction} className="mt-1">
        <Button type="submit" variant="secondary">
          Log out
        </Button>
      </form>
    </main>
  );
}
