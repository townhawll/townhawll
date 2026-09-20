import { z } from "zod";

import { normalizeEmail } from "./account.ts";

const ownerEmailSchema = z.string().trim().email();

export class OwnerBootstrapProductionError extends Error {
  override name = "OwnerBootstrapProductionError";
}

export class OwnerBootstrapDisabledError extends Error {
  override name = "OwnerBootstrapDisabledError";
}

export class OwnerAlreadyExistsError extends Error {
  override name = "OwnerAlreadyExistsError";
}

export class OwnerBootstrapUserError extends Error {
  override name = "OwnerBootstrapUserError";
}

export interface OwnerBootstrapDependencies {
  assignFirstOwner(email: string): Promise<{ userId: string }>;
}

async function createOwnerBootstrapDependencies(): Promise<OwnerBootstrapDependencies> {
  const { db } = await import("@townhawll/db");
  return {
    assignFirstOwner: (email) =>
      db.$transaction(
        async (transaction) => {
          const existingOwner = await transaction.staffRoleAssignment.findFirst(
            {
              where: { role: "OWNER" },
              select: {
                user: {
                  select: { email: true, emailVerified: true, status: true },
                },
                userId: true,
              },
            },
          );
          if (existingOwner) {
            if (normalizeEmail(existingOwner.user.email) === email) {
              if (
                existingOwner.user.emailVerified === null ||
                existingOwner.user.status !== "ACTIVE"
              ) {
                throw new OwnerBootstrapUserError(
                  "The bootstrap user must be an existing verified active account.",
                );
              }
              return { userId: existingOwner.userId };
            }
            throw new OwnerAlreadyExistsError(
              "An OWNER has already been bootstrapped.",
            );
          }

          const user = await transaction.user.findUnique({
            where: { email },
            select: { emailVerified: true, id: true, status: true },
          });
          if (
            !user ||
            user.emailVerified === null ||
            user.status !== "ACTIVE"
          ) {
            throw new OwnerBootstrapUserError(
              "The bootstrap user must be an existing verified active account.",
            );
          }

          await transaction.staffRoleAssignment.create({
            data: { role: "OWNER", userId: user.id },
          });
          return { userId: user.id };
        },
        { isolationLevel: "Serializable" },
      ),
  };
}

export async function bootstrapFirstOwner(
  rawEmail: string,
  options?: Readonly<{
    databaseUrl?: string;
    dependencies?: OwnerBootstrapDependencies;
    enabled?: string;
    nodeEnv?: string;
  }>,
): Promise<{ userId: string }> {
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV ?? "development";
  if (nodeEnv === "production") {
    throw new OwnerBootstrapProductionError(
      "The OWNER bootstrap command is disabled in production.",
    );
  }
  if (nodeEnv !== "development") {
    throw new OwnerBootstrapDisabledError(
      "The OWNER bootstrap command is available only in development.",
    );
  }

  const enabled = options?.enabled ?? process.env.OWNER_BOOTSTRAP_ENABLED;
  if (enabled !== "true") {
    throw new OwnerBootstrapDisabledError(
      "Set OWNER_BOOTSTRAP_ENABLED=true temporarily to run the local OWNER bootstrap.",
    );
  }

  const databaseUrl = options?.databaseUrl ?? process.env.DATABASE_URL;
  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl ?? "");
  } catch {
    throw new OwnerBootstrapDisabledError(
      "The OWNER bootstrap requires a valid local DATABASE_URL.",
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsedDatabaseUrl.hostname)
  ) {
    throw new OwnerBootstrapDisabledError(
      "The OWNER bootstrap is restricted to a local development database.",
    );
  }

  const parsedEmail = ownerEmailSchema.safeParse(normalizeEmail(rawEmail));
  if (!parsedEmail.success) {
    throw new OwnerBootstrapUserError("Provide a valid account email.");
  }

  const dependencies =
    options?.dependencies ?? (await createOwnerBootstrapDependencies());
  return dependencies.assignFirstOwner(parsedEmail.data);
}
