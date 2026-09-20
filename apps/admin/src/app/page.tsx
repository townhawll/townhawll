import { redirect } from "next/navigation";

import { getAdminRootDestination } from "@/lib/auth-flow";
import { getCurrentStaffState } from "@/lib/current-staff";

export default async function AdminHomePage() {
  redirect(getAdminRootDestination(await getCurrentStaffState()));
}
