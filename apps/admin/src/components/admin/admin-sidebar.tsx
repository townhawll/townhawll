import type { Permission } from "@townhawll/auth/permissions";
import type { StaffContext } from "@townhawll/auth/staff-context";
import { Badge, Separator } from "@townhawll/ui";
import Link from "next/link";

import { getStaffRoleSummary } from "@/lib/staff-display";
import { AdminNav } from "./admin-nav";

export function AdminSidebar({
  permissions,
  roles,
  onNavigate,
}: Readonly<{
  permissions: readonly Permission[];
  roles: StaffContext["roles"];
  onNavigate?: () => void;
}>) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link
          className="rounded-sm text-sm font-semibold tracking-tight text-foreground"
          href="/dashboard"
          {...(onNavigate ? { onClick: onNavigate } : {})}
        >
          TownHawll <span className="text-foreground-muted">Admin</span>
        </Link>
      </div>
      <Separator />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
        <p className="mb-2 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
          Workspace
        </p>
        <AdminNav
          permissions={permissions}
          {...(onNavigate ? { onNavigate } : {})}
        />
      </div>
      <div className="shrink-0 border-t border-border-subtle p-4">
        <Badge className="max-w-full truncate" variant="neutral">
          {getStaffRoleSummary(roles)}
        </Badge>
      </div>
    </div>
  );
}
