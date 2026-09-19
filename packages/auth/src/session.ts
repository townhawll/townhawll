import { randomBytes } from "node:crypto";

import { PrismaAdapter } from "@auth/prisma-adapter";
import { loadAuthEnvironment } from "@townhawll/config/server-env";
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";

import {
  createExistingUserOnlyGoogleAuthAdapter,
  createGoogleAuthAdapter,
  getAdminGoogleSignInDecision,
  getGoogleSignInDecision,
  GOOGLE_PROVIDER_ID,
  markGoogleUserVerified,
} from "./google.ts";
import {
  getAuthSessionCookieName,
  getAuthSessionCookieOptions,
} from "./cookies.ts";
import "./types.ts";

export const AUTH_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export { getAuthSessionCookieName, getAuthSessionCookieOptions };

export function createSessionRecord(userId: string, now = new Date()) {
  return {
    expires: new Date(now.getTime() + AUTH_SESSION_MAX_AGE_SECONDS * 1_000),
    sessionToken: randomBytes(32).toString("base64url"),
    userId,
  };
}

export async function createDatabaseSession(userId: string) {
  const { db } = await import("@townhawll/db");
  return db.session.create({ data: createSessionRecord(userId) });
}

interface EndDatabaseSessionDependencies {
  deleteSession(sessionToken: string): Promise<number>;
}

export async function endDatabaseSession(
  sessionToken: string | undefined,
  dependencies?: EndDatabaseSessionDependencies,
): Promise<boolean> {
  if (!sessionToken) return false;

  const sessionDependencies =
    dependencies ??
    ({
      async deleteSession(token: string) {
        const { db } = await import("@townhawll/db");
        const result = await db.session.deleteMany({
          where: { sessionToken: token },
        });
        return result.count;
      },
    } satisfies EndDatabaseSessionDependencies);

  return (await sessionDependencies.deleteSession(sessionToken)) === 1;
}

export async function createAuthConfig(): Promise<NextAuthConfig> {
  return createApplicationAuthConfig("web");
}

export async function createAdminAuthConfig(): Promise<NextAuthConfig> {
  return createApplicationAuthConfig("admin");
}

async function createApplicationAuthConfig(
  application: "admin" | "web",
): Promise<NextAuthConfig> {
  const environment = loadAuthEnvironment();
  const { db } = await import("@townhawll/db");
  const prismaAdapter = PrismaAdapter(db);
  const adapter =
    application === "admin"
      ? createExistingUserOnlyGoogleAuthAdapter(prismaAdapter)
      : createGoogleAuthAdapter({
          ...prismaAdapter,
          createUser: (user) =>
            db.user.create({
              data: {
                email: user.email,
                emailVerified: user.emailVerified,
                name: user.name ?? null,
                image: user.image ?? null,
                profile: {
                  create: {
                    displayName: user.name ?? null,
                    avatarUrl: user.image ?? null,
                  },
                },
              },
            }),
        } satisfies Adapter);

  return {
    adapter,
    cookies: {
      sessionToken: {
        name: getAuthSessionCookieName(),
        options: getAuthSessionCookieOptions(),
      },
    },
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== GOOGLE_PROVIDER_ID) return false;

        const decision =
          application === "admin"
            ? await getAdminGoogleSignInDecision({
                profile,
                providerAccountId: account.providerAccountId,
              })
            : await getGoogleSignInDecision({
                profile,
                providerAccountId: account.providerAccountId,
              });
        return decision.allowed;
      },
      async session({ session, user }) {
        session.user.id = user.id;
        const profile = await db.profile.findUnique({
          where: { userId: user.id },
          select: { username: true },
        });
        session.user.username = profile?.username ?? null;
        session.user.emailVerified = user.emailVerified;
        session.user.status = user.status;

        return session;
      },
    },
    events: {
      async signIn({ account, profile, user }) {
        if (account?.provider === GOOGLE_PROVIDER_ID && user.id) {
          await markGoogleUserVerified(user.id, profile);
        }
      },
    },
    pages:
      application === "admin"
        ? { error: "/login", signIn: "/login" }
        : { error: "/login", newUser: "/onboarding", signIn: "/login" },
    providers: [
      Google({
        allowDangerousEmailAccountLinking: true,
        clientId: environment.AUTH_GOOGLE_ID,
        clientSecret: environment.AUTH_GOOGLE_SECRET,
      }),
    ],
    secret: environment.AUTH_SECRET,
    session: {
      maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
      strategy: "database",
    },
  };
}

export function createTownHawllAuth() {
  return NextAuth(createAuthConfig);
}

export function createTownHawllAdminAuth() {
  return NextAuth(createAdminAuthConfig);
}
