import { takeRateLimit } from "@townhawll/cache";
import type { AccountStatus, StaffRole } from "@townhawll/db";
import type { Adapter } from "next-auth/adapters";
import { z } from "zod";

import { normalizeEmail } from "./account.ts";

export const GOOGLE_PROVIDER_ID = "google";

const verifiedGoogleProfileSchema = z.object({
  email: z.string().trim().email().transform(normalizeEmail),
  email_verified: z.literal(true),
  sub: z.string().min(1),
});

interface GoogleAccountUser {
  id: string;
  roles?: StaffRole[];
  status: AccountStatus;
}

interface GoogleSignInRepository {
  findByEmail(email: string): Promise<GoogleAccountUser | null>;
  findByProviderAccountId(
    providerAccountId: string,
  ): Promise<GoogleAccountUser | null>;
}

interface GoogleSignInDependencies {
  repository: GoogleSignInRepository;
}

export type GoogleSignInDecision =
  { allowed: false } | { allowed: true; flow: "link" | "new" | "returning" };

export type AdminGoogleSignInDecision =
  | { allowed: false }
  | {
      access: "non-staff" | "staff";
      allowed: true;
      flow: "link" | "returning";
      userId: string;
    };

const prismaGoogleSignInRepository: GoogleSignInRepository = {
  async findByEmail(email) {
    const { db } = await import("@townhawll/db");
    return db.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });
  },
  async findByProviderAccountId(providerAccountId) {
    const { db } = await import("@townhawll/db");
    const account = await db.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: GOOGLE_PROVIDER_ID,
          providerAccountId,
        },
      },
      select: { user: { select: { id: true, status: true } } },
    });
    return account?.user ?? null;
  },
};

const prismaAdminGoogleSignInRepository: GoogleSignInRepository = {
  async findByEmail(email) {
    const { db } = await import("@townhawll/db");
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        status: true,
        staffRoleAssignments: { select: { role: true } },
      },
    });
    return user
      ? {
          id: user.id,
          roles: user.staffRoleAssignments.map(({ role }) => role),
          status: user.status,
        }
      : null;
  },
  async findByProviderAccountId(providerAccountId) {
    const { db } = await import("@townhawll/db");
    const account = await db.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: GOOGLE_PROVIDER_ID,
          providerAccountId,
        },
      },
      select: {
        user: {
          select: {
            id: true,
            status: true,
            staffRoleAssignments: { select: { role: true } },
          },
        },
      },
    });
    return account
      ? {
          id: account.user.id,
          roles: account.user.staffRoleAssignments.map(({ role }) => role),
          status: account.user.status,
        }
      : null;
  },
};

function accountCanSignIn(status: AccountStatus): boolean {
  return status === "ACTIVE" || status === "RESTRICTED";
}

export function parseVerifiedGoogleProfile(profile: unknown) {
  const result = verifiedGoogleProfileSchema.safeParse(profile);
  return result.success ? result.data : null;
}

export async function getGoogleSignInDecision(
  input: { profile: unknown; providerAccountId: string },
  dependencies: GoogleSignInDependencies = {
    repository: prismaGoogleSignInRepository,
  },
): Promise<GoogleSignInDecision> {
  const profile = parseVerifiedGoogleProfile(input.profile);
  if (!profile) return { allowed: false };

  const accountUser = await dependencies.repository.findByProviderAccountId(
    input.providerAccountId,
  );
  if (accountUser) {
    return accountCanSignIn(accountUser.status)
      ? { allowed: true, flow: "returning" }
      : { allowed: false };
  }

  const emailUser = await dependencies.repository.findByEmail(profile.email);
  if (emailUser) {
    return accountCanSignIn(emailUser.status)
      ? { allowed: true, flow: "link" }
      : { allowed: false };
  }

  return { allowed: true, flow: "new" };
}

export async function getAdminGoogleSignInDecision(
  input: { profile: unknown; providerAccountId: string },
  dependencies: GoogleSignInDependencies = {
    repository: prismaAdminGoogleSignInRepository,
  },
): Promise<AdminGoogleSignInDecision> {
  const profile = parseVerifiedGoogleProfile(input.profile);
  if (!profile) return { allowed: false };

  const accountUser = await dependencies.repository.findByProviderAccountId(
    input.providerAccountId,
  );
  const flow = accountUser ? "returning" : "link";
  const user =
    accountUser ?? (await dependencies.repository.findByEmail(profile.email));

  if (!user || user.status !== "ACTIVE") return { allowed: false };

  return {
    access: user.roles?.length ? "staff" : "non-staff",
    allowed: true,
    flow,
    userId: user.id,
  };
}

export function createGoogleAuthAdapter(
  adapter: Adapter,
  now: () => Date = () => new Date(),
): Adapter {
  if (!adapter.createUser) {
    throw new Error("The Google auth adapter must support user creation.");
  }

  const createUser = adapter.createUser.bind(adapter);
  return {
    ...adapter,
    createUser(user) {
      return createUser({ ...user, emailVerified: now() });
    },
  };
}

export function createExistingUserOnlyGoogleAuthAdapter(
  adapter: Adapter,
): Adapter {
  return {
    ...adapter,
    createUser() {
      throw new Error("Admin Google OAuth cannot create TownHawll users.");
    },
  };
}

export async function markGoogleUserVerified(
  userId: string,
  profile: unknown,
): Promise<void> {
  if (!parseVerifiedGoogleProfile(profile)) return;

  const { db } = await import("@townhawll/db");
  await db.user.updateMany({
    where: { emailVerified: null, id: userId },
    data: { emailVerified: new Date() },
  });
}

export async function allowGoogleOAuthStart(
  ipAddress: string,
): Promise<boolean> {
  const result = await takeRateLimit({
    namespace: "oauth-start:google:ip",
    signal: ipAddress,
    limit: 20,
    windowSeconds: 15 * 60,
  });
  return result.allowed;
}
