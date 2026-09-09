import { takeRateLimit } from "@townhawll/cache";
import type { AccountStatus } from "@townhawll/db";
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
