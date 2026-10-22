import type { Prisma } from "@townhawll/db";

import { prepareAuditEvent, type AuditEventInput } from "./contracts.ts";

export type AuditWriter = Pick<Prisma.TransactionClient, "adminAuditEvent">;

/** The trusted domain caller supplies the actor from server-side authorization. */
export async function appendAuditEvent(
  transaction: AuditWriter,
  input: AuditEventInput,
) {
  const data = prepareAuditEvent(input);
  return transaction.adminAuditEvent.create({ data });
}

/** Failure evidence survives rollback of a separate content transaction. */
export async function recordAuditEvent(input: AuditEventInput) {
  const { db } = await import("@townhawll/db");
  return appendAuditEvent(db, input);
}
