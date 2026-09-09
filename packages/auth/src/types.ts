import type { AccountStatus } from "@townhawll/db";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string | null;
      emailVerified: Date | null;
      status: AccountStatus;
    } & DefaultSession["user"];
  }

  interface User {
    username: string | null;
    emailVerified: Date | null;
    status: AccountStatus;
  }
}

export {};
