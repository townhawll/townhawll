import { Badge, Separator } from "@townhawll/ui";
import type { Metadata } from "next";

import { getVisibleAdminNavigation } from "@/lib/admin-navigation";
import { requireCurrentStaff } from "@/lib/current-staff";
import { getStaffRoleLabel } from "@/lib/staff-display";

export const metadata: Metadata = { title: "Dashboard | TownHawll Admin" };

export default async function DashboardPage() {
  const staff = await requireCurrentStaff();
  const availableAreas = getVisibleAdminNavigation(staff.permissions);
  const greeting = staff.name?.trim() || staff.email;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header>
        <p className="text-sm font-medium text-accent">Dashboard</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Welcome, {greeting}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">
          Your workspace shows only the admin areas allowed by your current
          staff permissions.
        </p>
      </header>

      <Separator className="my-6" />

      <section aria-labelledby="access-heading" className="max-w-3xl">
        <h2 id="access-heading" className="text-base font-semibold">
          Access summary
        </h2>
        <dl className="mt-4 grid gap-5 rounded-lg border border-border-default bg-surface-1 p-5 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-foreground-muted">
              Assigned roles
            </dt>
            <dd className="mt-2 flex flex-wrap gap-1.5">
              {staff.roles.map((role) => (
                <Badge key={role}>{getStaffRoleLabel(role)}</Badge>
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground-muted">
              Effective permissions
            </dt>
            <dd className="mt-2 text-sm font-semibold text-foreground">
              {staff.permissions.size}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground-muted">
              Available areas
            </dt>
            <dd className="mt-2 text-sm font-semibold text-foreground">
              {availableAreas.length}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="workspace-heading" className="mt-8 max-w-3xl">
        <h2 id="workspace-heading" className="text-base font-semibold">
          Workspace
        </h2>
        <p className="mt-2 text-sm leading-6 text-foreground-secondary">
          Administrative tools will appear in the navigation as their routes are
          implemented and your permissions allow them.
        </p>
      </section>
    </div>
  );
}
