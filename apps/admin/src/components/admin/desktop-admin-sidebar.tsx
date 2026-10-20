"use client";

import type { Permission } from "@townhawll/auth/permissions";
import type { StaffContext } from "@townhawll/auth/staff-context";
import { cn } from "@townhawll/ui";
import { useState } from "react";

import { AdminSidebar } from "./admin-sidebar";

export function DesktopAdminSidebar({
  permissions,
  roles,
}: Readonly<{
  permissions: readonly Permission[];
  roles: StaffContext["roles"];
}>) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 border-r border-border-subtle md:block",
        collapsed ? "w-16" : "w-60",
      )}
      id="desktop-admin-sidebar"
    >
      <AdminSidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        permissions={permissions}
        roles={roles}
      />
    </aside>
  );
}
