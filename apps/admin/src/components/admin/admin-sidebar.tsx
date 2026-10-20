import type { Permission } from "@townhawll/auth/permissions";
import type { StaffContext } from "@townhawll/auth/staff-context";
import { Badge, Button, cn, Separator } from "@townhawll/ui";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";

import { getStaffRoleSummary } from "@/lib/staff-display";
import { AdminNav } from "./admin-nav";

export function AdminSidebar({
  permissions,
  roles,
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: Readonly<{
  permissions: readonly Permission[];
  roles: StaffContext["roles"];
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}>) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      <div
        className={cn(
          "flex h-16 shrink-0 items-center",
          collapsed
            ? "justify-center px-2"
            : onToggleCollapsed
              ? "justify-between gap-2 px-3"
              : "px-5",
        )}
      >
        {!collapsed && (
          <Link
            className="rounded-sm text-sm font-semibold tracking-tight text-foreground"
            href="/dashboard"
            {...(onNavigate ? { onClick: onNavigate } : {})}
          >
            TownHawll <span className="text-foreground-muted">Admin</span>
          </Link>
        )}
        {onToggleCollapsed && (
          <Button
            aria-controls="desktop-admin-sidebar"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="size-10 shrink-0 px-0"
            onClick={onToggleCollapsed}
            size="sm"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            variant="ghost"
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" className="size-4" />
            ) : (
              <PanelLeftClose aria-hidden="true" className="size-4" />
            )}
          </Button>
        )}
      </div>
      <Separator />
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto py-5",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {!collapsed && (
          <p className="mb-2 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
            Workspace
          </p>
        )}
        <AdminNav
          collapsed={collapsed}
          permissions={permissions}
          {...(onNavigate ? { onNavigate } : {})}
        />
      </div>
      {!collapsed && (
        <div className="shrink-0 border-t border-border-subtle p-4">
          <Badge className="max-w-full truncate" variant="neutral">
            {getStaffRoleSummary(roles)}
          </Badge>
        </div>
      )}
    </div>
  );
}
