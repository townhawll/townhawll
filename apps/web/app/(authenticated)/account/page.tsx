import { Button } from "@townhawll/ui";
import type { Metadata } from "next";

import { requireCurrentVerifiedUser } from "../../_lib/current-user";
import { logoutAction } from "./actions";

export const metadata: Metadata = { title: "Account | TownHawll" };

export default async function AccountPage() {
  const user = await requireCurrentVerifiedUser("/account");

  return (
    <main className="mx-auto grid min-h-screen w-[min(100%-2rem,40rem)] content-center gap-6 py-12">
      <div>
        <p className="text-sm font-medium text-accent">Signed in</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {user.username ?? user.email}
        </h1>
        <p className="mt-2 text-sm text-foreground-secondary">
          Your secure TownHawll session is active.
        </p>
      </div>
      <form action={logoutAction}>
        <input name="callbackUrl" type="hidden" value="/" />
        <Button variant="secondary" type="submit">
          Sign out
        </Button>
      </form>
    </main>
  );
}
