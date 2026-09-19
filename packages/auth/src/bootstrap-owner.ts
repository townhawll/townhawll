import { z } from "zod";

import { normalizeEmail } from "./account.ts";

const ownerEmailSchema = z.string().trim().email();

export class OwnerBootstrapProductionError extends Error {
  override name = "OwnerBootstrapProductionError";
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
              select: { userId: true },
            },
          );
          if (existingOwner) {
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
    dependencies?: OwnerBootstrapDependencies;
    nodeEnv?: string;
  }>,
): Promise<{ userId: string }> {
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV ?? "development";
  if (nodeEnv === "production") {
    throw new OwnerBootstrapProductionError(
      "The OWNER bootstrap command is disabled in production.",
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
