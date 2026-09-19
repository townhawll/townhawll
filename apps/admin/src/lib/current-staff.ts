import {
  OwnerRequiredError,
  PermissionRequiredError,
  requireAllPermissions,
  requireAnyPermission,
  requireOwner,
  requirePermission,
  type Permission,
} from "@townhawll/auth/permissions";
import {
  getStaffAccessBySessionToken,
  type StaffAccessState,
  type StaffContext,
} from "@townhawll/auth/staff-context";
import { getAuthSessionCookieName } from "@townhawll/auth/cookies";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function getLoginDestination(callbackUrl: string): string {
  const loginUrl = new URL("https://townhawll.invalid/login");
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  return `${loginUrl.pathname}${loginUrl.search}`;
}

export async function getCurrentStaffState(): Promise<StaffAccessState> {
  const cookieStore = await cookies();
  return getStaffAccessBySessionToken(
    cookieStore.get(getAuthSessionCookieName())?.value,
  );
}

export async function getCurrentStaff(): Promise<StaffContext | null> {
  const state = await getCurrentStaffState();
  return state.status === "authorized" ? state.staff : null;
}

export async function requireCurrentStaff(
  callbackUrl = "/dashboard",
): Promise<StaffContext> {
  const state = await getCurrentStaffState();
  if (state.status === "unauthenticated") {
    redirect(getLoginDestination(callbackUrl));
  }
  if (state.status === "forbidden") redirect("/403");
  return state.staff;
}

function denyExpectedAuthorizationError(error: unknown): never {
  if (
    error instanceof PermissionRequiredError ||
    error instanceof OwnerRequiredError
  ) {
    redirect("/403");
  }
  throw error;
}

export async function requireCurrentPermission(
  permission: Permission,
): Promise<StaffContext> {
  const staff = await requireCurrentStaff();
  try {
    requirePermission(staff.roles, permission);
  } catch (error) {
    denyExpectedAuthorizationError(error);
  }
  return staff;
}

export async function requireCurrentAnyPermission(
  permissions: Iterable<Permission>,
): Promise<StaffContext> {
  const staff = await requireCurrentStaff();
  try {
    requireAnyPermission(staff.roles, permissions);
  } catch (error) {
    denyExpectedAuthorizationError(error);
  }
  return staff;
}

export async function requireCurrentAllPermissions(
  permissions: Iterable<Permission>,
): Promise<StaffContext> {
  const staff = await requireCurrentStaff();
  try {
    requireAllPermissions(staff.roles, permissions);
  } catch (error) {
    denyExpectedAuthorizationError(error);
  }
  return staff;
}

export async function requireCurrentOwner(): Promise<StaffContext> {
  const staff = await requireCurrentStaff();
  try {
    requireOwner(staff.roles);
  } catch (error) {
    denyExpectedAuthorizationError(error);
  }
  return staff;
}
