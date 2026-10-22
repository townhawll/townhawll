import { PERMISSION, hasPermission } from "@townhawll/auth/permissions";
import type { StaffContext } from "@townhawll/auth/staff-context";
import { CatalogueImportError } from "./errors.ts";
import type { ImportOperation } from "./repository.ts";
import type { ImportTransitionInput } from "./contracts.ts";

export function requireImportCreation(staff: StaffContext) {
  if (
    staff.accountStatus !== "ACTIVE" ||
    !hasPermission(staff.roles, PERMISSION.CONTENT_CREATE)
  )
    throw new CatalogueImportError("UNAUTHORIZED");
}
export function requireImportInspection(staff: StaffContext) {
  if (
    staff.accountStatus !== "ACTIVE" ||
    !(
      hasPermission(staff.roles, PERMISSION.CONTENT_CREATE) ||
      hasPermission(staff.roles, PERMISSION.OPERATIONS_READ)
    )
  )
    throw new CatalogueImportError("UNAUTHORIZED");
}
export function requireImportRead(
  staff: StaffContext,
  operation: ImportOperation,
) {
  if (
    staff.accountStatus !== "ACTIVE" ||
    !(
      hasPermission(staff.roles, PERMISSION.OPERATIONS_READ) ||
      (staff.userId === operation.actorId &&
        hasPermission(staff.roles, PERMISSION.CONTENT_CREATE))
    )
  )
    throw new CatalogueImportError("UNAUTHORIZED");
}
export function requireImportTransition(
  staff: StaffContext,
  operation: ImportOperation,
  input: ImportTransitionInput,
) {
  requireImportRead(staff, operation);
  if (operation.status === "FAILED" && input.status === "PENDING") {
    if (!hasPermission(staff.roles, PERMISSION.OPERATIONS_RETRY_JOB))
      throw new CatalogueImportError("UNAUTHORIZED");
  } else if (input.status === "CANCELLED") {
    if (!(
      hasPermission(staff.roles, PERMISSION.OPERATIONS_CANCEL_JOB) ||
      (staff.userId === operation.actorId &&
        hasPermission(staff.roles, PERMISSION.CONTENT_CREATE))
    ))
      throw new CatalogueImportError("UNAUTHORIZED");
  } else requireImportCreation(staff);
}
