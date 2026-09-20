import type { StaffContext } from "@townhawll/auth/staff-context";

import { AdminHeader } from "./admin-header";
import { AdminSidebar } from "./admin-sidebar";

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
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r border-border-subtle md:block">
        <AdminSidebar
          permissions={[...staff.permissions]}
          roles={staff.roles}
        />
      </aside>
      <div className="min-w-0">
        <AdminHeader publicAppUrl={publicAppUrl} staff={staff} />
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
