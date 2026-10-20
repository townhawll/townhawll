import type { StaffContext } from "@townhawll/auth/staff-context";

import { AdminHeader } from "./admin-header";
import { DesktopAdminSidebar } from "./desktop-admin-sidebar";

export function AdminShell({
  children,
  publicAppUrl,
  staff,
}: Readonly<{
  children: React.ReactNode;
  publicAppUrl: string;
  staff: StaffContext;
}>) {
  return (
    <div className="min-h-dvh bg-background md:flex">
      <DesktopAdminSidebar
        permissions={[...staff.permissions]}
        roles={staff.roles}
      />
      <div className="min-w-0 flex-1">
        <AdminHeader publicAppUrl={publicAppUrl} staff={staff} />
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
