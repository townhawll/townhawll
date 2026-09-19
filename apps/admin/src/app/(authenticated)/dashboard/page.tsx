import { Badge, Separator } from "@townhawll/ui";

import { requireCurrentStaff } from "@/lib/current-staff";

export default async function DashboardPage() {
  const staff = await requireCurrentStaff();

  return (
    <main className="mx-auto grid min-h-screen w-[min(100%-2rem,48rem)] content-center gap-5 py-12">
      <Badge>TownHawll Admin</Badge>
      <h1 className="text-4xl font-semibold tracking-tight">
        Admin access is ready.
      </h1>
      <Separator />
      <p className="text-sm leading-6 text-foreground-secondary">
        Signed in as {staff.email}. The full admin shell will be added in Step
        7C.
      </p>
    </main>
  );
}
