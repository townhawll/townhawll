import type { AccountStatus, StaffRole } from "@townhawll/db";

import { getEffectivePermissions, type Permission } from "./permissions.ts";

export interface SessionIdentity {
  email: string;
  emailVerified: Date | null;
  id: string;
  name: string | null;
  roles: StaffRole[];
  status: AccountStatus;
  username: string | null;
}

export interface StaffContext {
  accountStatus: "ACTIVE";
  email: string;
  name: string | null;
  permissions: ReadonlySet<Permission>;
  roles: readonly StaffRole[];
  userId: string;
  username: string | null;
}

export type StaffAccessState =
  | { status: "unauthenticated" }
  | { status: "forbidden"; reason: "account" | "roles" | "verification" }
  | { status: "authorized"; staff: StaffContext };

interface DatabaseSessionRecord {
  expires: Date;
  user: SessionIdentity;
}

interface SessionLookupDependencies {
  deleteExpiredSession(sessionToken: string): Promise<void>;
  findSession(sessionToken: string): Promise<DatabaseSessionRecord | null>;
}

const defaultSessionLookupDependencies: SessionLookupDependencies = {
  async deleteExpiredSession(sessionToken) {
    const { db } = await import("@townhawll/db");
    await db.session.deleteMany({ where: { sessionToken } });
  },
  async findSession(sessionToken) {
    const { db } = await import("@townhawll/db");
    const session = await db.session.findUnique({
      where: { sessionToken },
      select: {
        expires: true,
        user: {
          select: {
            email: true,
            emailVerified: true,
            id: true,
            name: true,
            profile: { select: { username: true } },
            status: true,
            staffRoleAssignments: {
              orderBy: { assignedAt: "asc" },
              select: { role: true },
            },
          },
        },
      },
    });

    if (!session) return null;

    return {
      expires: session.expires,
      user: {
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        id: session.user.id,
        name: session.user.name,
        roles: session.user.staffRoleAssignments.map(({ role }) => role),
        status: session.user.status,
        username: session.user.profile?.username ?? null,
      },
    };
  },
};

export function resolveStaffAccess(
  identity: SessionIdentity | null,
): StaffAccessState {
  if (!identity) return { status: "unauthenticated" };
  if (!identity.emailVerified) {
    return { reason: "verification", status: "forbidden" };
  }
  if (identity.status !== "ACTIVE") {
    return { reason: "account", status: "forbidden" };
  }
  if (identity.roles.length === 0) {
    return { reason: "roles", status: "forbidden" };
  }

  const roles = [...new Set(identity.roles)];
  return {
    status: "authorized",
    staff: {
      accountStatus: "ACTIVE",
      email: identity.email,
      name: identity.name,
      permissions: getEffectivePermissions(roles),
      roles,
      userId: identity.id,
      username: identity.username,
    },
  };
}

export async function getStaffAccessBySessionToken(
  sessionToken: string | undefined,
  dependencies: SessionLookupDependencies = defaultSessionLookupDependencies,
  now = new Date(),
): Promise<StaffAccessState> {
  if (!sessionToken) return { status: "unauthenticated" };

  const session = await dependencies.findSession(sessionToken);
  if (!session) return { status: "unauthenticated" };
  if (session.expires <= now) {
    await dependencies.deleteExpiredSession(sessionToken);
    return { status: "unauthenticated" };
  }

  return resolveStaffAccess(session.user);
}
