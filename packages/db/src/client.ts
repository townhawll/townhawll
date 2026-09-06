import { PrismaPg } from "@prisma/adapter-pg";
import { loadDbEnvironment } from "@townhawll/config/server-env";

import { PrismaClient } from "../generated/prisma/client.js";

const environment = loadDbEnvironment();
const adapter = new PrismaPg({
  connectionString: environment.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
});

const globalForDb = globalThis as typeof globalThis & {
  townhawllDb?: PrismaClient;
};

export const db = globalForDb.townhawllDb ?? new PrismaClient({ adapter });

if (environment.NODE_ENV !== "production") {
  globalForDb.townhawllDb = db;
}

export type { Prisma } from "../generated/prisma/client.js";
