import { randomBytes } from "node:crypto";

import { PrismaAdapter } from "@auth/prisma-adapter";
import { loadAuthEnvironment } from "@townhawll/config/server-env";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import {
  createGoogleAuthAdapter,
  getGoogleSignInDecision,
  GOOGLE_PROVIDER_ID,
  markGoogleUserVerified,
} from "./google.ts";
import "./types.ts";

export const AUTH_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function getAuthSessionCookieName(
  environment = process.env.NODE_ENV,
): string {
  return environment === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export function getAuthSessionCookieOptions(
  environment = process.env.NODE_ENV,
) {
  return {
    httpOnly: true,
    path: "/" as const,
    sameSite: "lax" as const,
    secure: environment === "production",
  };
}

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
  const environment = loadAuthEnvironment();
  const { db } = await import("@townhawll/db");

  return {
    adapter: createGoogleAuthAdapter(PrismaAdapter(db)),
    cookies: {
      sessionToken: {
        name: getAuthSessionCookieName(),
        options: getAuthSessionCookieOptions(),
      },
    },
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== GOOGLE_PROVIDER_ID) return false;

        const decision = await getGoogleSignInDecision({
          profile,
          providerAccountId: account.providerAccountId,
        });
        return decision.allowed;
      },
      session({ session, user }) {
        session.user.id = user.id;
        session.user.username = user.username;
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
    pages: { error: "/login", newUser: "/account", signIn: "/login" },
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
