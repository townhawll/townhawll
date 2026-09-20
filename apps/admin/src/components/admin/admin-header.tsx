import type { StaffContext } from "@townhawll/auth/staff-context";

import { MobileAdminNavigation } from "./mobile-admin-navigation";
import { StaffMenu } from "./staff-menu";

export function AdminHeader({
  publicAppUrl,
  staff,
}: Readonly<{ publicAppUrl: string; staff: StaffContext }>) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border-subtle bg-background/95 px-4 supports-[backdrop-filter]:backdrop-blur-sm sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileAdminNavigation
          permissions={[...staff.permissions]}
          roles={staff.roles}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            Admin workspace
          </p>
          <p className="hidden text-xs text-foreground-muted sm:block">
            TownHawll operations
          </p>
        </div>
      </div>
      <StaffMenu
        email={staff.email}
        name={staff.name}
        publicAppUrl={publicAppUrl}
        roles={staff.roles}
        username={staff.username}
      />
    </header>
  );
}
