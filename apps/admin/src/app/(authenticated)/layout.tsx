import { requireCurrentStaff } from "@/lib/current-staff";

export default async function AuthenticatedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireCurrentStaff();
  return children;
}
