import type { StaffRole } from "@townhawll/db";

export async function getStaffRoles(userId: string): Promise<StaffRole[]> {
  const { db } = await import("@townhawll/db");
  const assignments = await db.staffRoleAssignment.findMany({
    where: { userId },
    orderBy: { assignedAt: "asc" },
    select: { role: true },
  });
  return assignments.map((assignment) => assignment.role);
}
