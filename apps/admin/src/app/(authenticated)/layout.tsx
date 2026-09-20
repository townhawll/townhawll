import { loadAppEnvironment } from "@townhawll/config/server-env";

import { AdminShell } from "@/components/admin/admin-shell";
import { requireCurrentStaff } from "@/lib/current-staff";

export default async function AuthenticatedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const staff = await requireCurrentStaff();
  const { APP_URL: publicAppUrl } = loadAppEnvironment();

  return (
    <AdminShell publicAppUrl={publicAppUrl} staff={staff}>
      {children}
    </AdminShell>
  );
}
