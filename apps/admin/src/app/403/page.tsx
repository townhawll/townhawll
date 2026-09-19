import { Button } from "@townhawll/ui";
import { redirect } from "next/navigation";

import { getCurrentStaffState } from "@/lib/current-staff";
import { adminLogoutAction } from "./actions";

export default async function ForbiddenPage() {
  const state = await getCurrentStaffState();
  if (state.status === "unauthenticated") {
    redirect("/login?callbackUrl=%2Fdashboard");
  }

  return (
    <main className="mx-auto grid min-h-screen w-[min(100%-2rem,38rem)] content-center gap-4 py-12">
      <p className="text-sm font-semibold text-accent">403</p>
      <h1 className="text-3xl font-semibold tracking-tight">Access denied</h1>
      <p className="max-w-xl text-sm leading-6 text-foreground-secondary">
        This TownHawll account does not have access to this admin area.
      </p>
      <form action={adminLogoutAction} className="mt-2">
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </main>
  );
}
