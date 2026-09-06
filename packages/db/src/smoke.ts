import path from "node:path";

import { loadServerEnvironment } from "@townhawll/config/server-env";
import { config as loadDotenv } from "dotenv";

loadDotenv({
  path: path.resolve(import.meta.dirname, "../../../.env"),
  quiet: true,
});

loadServerEnvironment();

const { db } = await import("./client.js");

try {
  const result = await db.$queryRaw<
    Array<{ connected: number }>
  >`SELECT 1 AS connected`;

  if (result[0]?.connected !== 1) {
    throw new Error(
      "Database connectivity check returned an unexpected result.",
    );
  }

  console.log("Database connection successful.");
} finally {
  await db.$disconnect();
}
