import path from "node:path";

import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

loadDotenv({
  path: path.resolve(import.meta.dirname, "../../.env"),
  quiet: true,
});

const databaseUrl = process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(databaseUrl === undefined
    ? {}
    : {
        datasource: {
          url: databaseUrl,
        },
      }),
});
