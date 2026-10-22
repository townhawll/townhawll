import { appendAuditEvent } from "@townhawll/audit/server";
import type { StaffContext } from "@townhawll/auth/staff-context";
import type { Prisma } from "@townhawll/db";
import { providerMappingKey } from "@townhawll/integrations/identity";

import {
  transitionInputSchema,
  type DuplicateCheckResult,
  type ImportTransitionInput,
} from "./contracts.ts";
import { importNames, possibleDuplicateMatches } from "./duplicates.ts";
import { CatalogueImportError, databaseErrorCode } from "./errors.ts";
import { assertImportTransition } from "./lifecycle.ts";
import {
  requireImportCreation,
  requireImportInspection,
  requireImportTransition,
} from "./authorization.ts";
import {
  importRequestHash,
  type ValidatedImportSubmission,
} from "./validation.ts";

type Database = typeof import("@townhawll/db").db;
export type ImportOperation = Prisma.CatalogueImportOperationGetPayload<
  Record<string, never>
>;
type Transaction = Prisma.TransactionClient;
const titleSelect = {
  id: true,
  title: true,
  originalTitle: true,
  type: true,
  primaryReleaseDate: true,
  deletedAt: true,
  aliases: { select: { name: true, normalizedKey: true } },
} as const;

export async function checkCatalogueDuplicates(
  transaction: Transaction,
  input: ValidatedImportSubmission,
): Promise<DuplicateCheckResult> {
  const mappings = [
    ...input.candidate.title.mappings.map((mapping) => mapping.identity),
    ...(input.gameSupplement ? [input.gameSupplement.identity] : []),
  ].map(providerMappingKey);
  const exactMappings = await transaction.titleProviderMapping.findMany({
    where: { OR: mappings },
    select: {
      provider: true,
      providerId: true,
      title: { select: titleSelect },
    },
    orderBy: [{ provider: "asc" }, { providerId: "asc" }],
  });
  const exactIds = new Set(exactMappings.map((mapping) => mapping.title.id));
  const names = importNames(input),
    bounded = names.slice(0, 100);
  const matches = await transaction.$queryRaw<{ id: string }[]>`
    SELECT t.id FROM titles t
    WHERE t.type = ${input.canonical.type}::"TitleType" AND (
      catalogue_duplicate_name_key(t.title) = ANY(ARRAY(SELECT catalogue_duplicate_name_key(n) FROM unnest(${bounded}::text[]) n))
      OR catalogue_duplicate_name_key(t.original_title) = ANY(ARRAY(SELECT catalogue_duplicate_name_key(n) FROM unnest(${bounded}::text[]) n))
      OR EXISTS (SELECT 1 FROM title_aliases a WHERE a.title_id = t.id AND
        (a.normalized_key = ANY(${bounded}::text[]) OR catalogue_duplicate_name_key(a.name) = ANY(ARRAY(SELECT catalogue_duplicate_name_key(n) FROM unnest(${bounded}::text[]) n))))
    ) ORDER BY t.id LIMIT 101`;
  const rows = matches.length
    ? await transaction.title.findMany({
        where: { id: { in: matches.slice(0, 100).map((value) => value.id) } },
        select: titleSelect,
      })
    : [];
  return {
    exact: [
      ...new Map(
        exactMappings.map((mapping) => [
          mapping.title.id,
          {
            titleId: mapping.title.id,
            title: mapping.title.title,
            type: mapping.title.type,
            deleted: mapping.title.deletedAt !== null,
            evidence: [
              {
                kind: "PROVIDER_MAPPING" as const,
                value: `${mapping.provider}:${mapping.providerId}`,
              },
            ],
          },
        ]),
      ).values(),
    ],
    possible: possibleDuplicateMatches(input, rows).filter(
      (row) => !exactIds.has(row.titleId),
    ),
    truncated: names.length > 100 || matches.length > 100,
  };
}

export function createIngestionRepository(database: Database) {
  async function findOperation(id: string) {
    return database.catalogueImportOperation.findUnique({ where: { id } });
  }
  async function begin(
    staff: StaffContext,
    input: ValidatedImportSubmission,
    idempotencyKey: string,
    requestId: string,
  ) {
    requireImportCreation(staff);
    const identity = input.candidate.title.identity;
    const requestHash = importRequestHash(input);
    const scope = {
      actorId: staff.userId,
      type: "IMPORT_TITLE" as const,
      idempotencyKey,
    };
    const replay = (existing: ImportOperation) => {
      if (existing.requestHash !== requestHash)
        throw new CatalogueImportError("IDEMPOTENCY_CONFLICT");
      return { operation: existing, replayed: true };
    };
    try {
      return await database.$transaction(async (tx) => {
        const existing = await tx.catalogueImportOperation.findUnique({
          where: { actorId_type_idempotencyKey: scope },
        });
        if (existing) return replay(existing);
        const duplicates = await checkCatalogueDuplicates(tx, input);
        if (duplicates.exact.length)
          throw new CatalogueImportError("EXACT_DUPLICATE");
        if (duplicates.possible.length || duplicates.truncated)
          throw new CatalogueImportError("POSSIBLE_DUPLICATE");
        const operation = await tx.catalogueImportOperation.create({
          data: {
            ...scope,
            provider: identity.provider,
            providerEntity: identity.entity,
            providerExternalId: identity.id,
            titleType: input.canonical.type,
            requestHash,
          },
        });
        await appendAuditEvent(tx, {
          actorId: staff.userId,
          actorRoles: [...staff.roles],
          action: "catalogue.import.requested",
          targetType: "catalogueImport",
          targetId: operation.id,
          result: "SUCCESS",
          changes: { status: { before: null, after: "PENDING" } },
          requestId,
        });
        return { operation, replayed: false };
      });
    } catch (error) {
      if (databaseErrorCode(error) !== "P2002") throw error;
      // The unique insert waits for the winner to commit; read its durable result after rollback.
      const existing = await database.catalogueImportOperation.findUnique({
        where: { actorId_type_idempotencyKey: scope },
      });
      if (existing) return replay(existing);
      throw new CatalogueImportError("CONCURRENT_IMPORT");
    }
  }
  async function transition(
    staff: StaffContext,
    input: ImportTransitionInput,
    requestId: string,
  ) {
    try {
      return await database.$transaction(async (tx) =>
        transitionImportOperation(tx, staff, input, requestId),
      );
    } catch (error) {
      if (databaseErrorCode(error) === "P2002")
        throw new CatalogueImportError("CONCURRENT_IMPORT");
      throw error;
    }
  }
  return {
    findOperation,
    begin,
    transition,
    checkDuplicates: (input: ValidatedImportSubmission) =>
      database.$transaction((tx) => checkCatalogueDuplicates(tx, input)),
  };
}

/** Future catalogue persistence calls this in the SAME transaction as Title + mappings. */
export async function transitionImportOperation(
  tx: Transaction,
  staff: StaffContext,
  input: ImportTransitionInput,
  requestId: string,
) {
  requireImportInspection(staff);
  const parsed = transitionInputSchema.safeParse(input);
  if (!parsed.success) throw new CatalogueImportError("VALIDATION_FAILED");
  input = parsed.data;
  const current = await tx.catalogueImportOperation.findUnique({
    where: { id: input.operationId },
  });
  if (!current) throw new CatalogueImportError("NOT_FOUND");
  requireImportTransition(staff, current, input);
  if (current.version !== input.expectedVersion)
    throw new CatalogueImportError("CONCURRENT_MODIFICATION");
  assertImportTransition(current.status, input);
  if (
    current.status === "FAILED" &&
    input.status === "PENDING" &&
    !current.failureRetryable
  )
    throw new CatalogueImportError("INVALID_TRANSITION");
  if (input.status === "SUCCEEDED") {
    if (!input.resultTitleId)
      throw new CatalogueImportError("INVALID_TRANSITION");
    const target = await tx.title.findUnique({
      where: { id: input.resultTitleId },
      select: {
        type: true,
        providerMappings: { select: { provider: true, providerId: true } },
      },
    });
    if (
      !target ||
      target.type !== current.titleType ||
      !target.providerMappings.some(
        (mapping) =>
          mapping.provider === current.provider &&
          mapping.providerId ===
            `${current.providerEntity}:${current.providerExternalId}`,
      )
    )
      throw new CatalogueImportError("VALIDATION_FAILED");
  }
  const now = new Date();
  const updated = await tx.catalogueImportOperation.updateMany({
    where: {
      id: current.id,
      version: input.expectedVersion,
      status: current.status,
    },
    data: {
      status: input.status,
      version: { increment: 1 },
      attemptCount:
        input.status === "RUNNING" ? { increment: 1 } : current.attemptCount,
      startedAt:
        input.status === "RUNNING"
          ? now
          : input.status === "PENDING"
            ? null
            : current.startedAt,
      completedAt: ["SUCCEEDED", "FAILED", "CANCELLED"].includes(input.status)
        ? now
        : null,
      resultTitleId: input.resultTitleId ?? null,
      failureCode: input.failureCode ?? null,
      failureRetryable:
        input.failureCode === "PROVIDER_UNAVAILABLE" ||
        input.failureCode === "DATABASE_UNAVAILABLE",
    },
  });
  if (updated.count !== 1)
    throw new CatalogueImportError("CONCURRENT_MODIFICATION");
  await appendAuditEvent(tx, {
    actorId: staff.userId,
    actorRoles: [...staff.roles],
    action: "catalogue.import.transitioned",
    targetType: "catalogueImport",
    targetId: current.id,
    result: "SUCCESS",
    requestId,
    changes: {
      status: { before: current.status, after: input.status },
      attemptCount: {
        before: current.attemptCount,
        after: current.attemptCount + (input.status === "RUNNING" ? 1 : 0),
      },
      resultTitleId: {
        before: current.resultTitleId,
        after: input.resultTitleId ?? null,
      },
      failureCode: {
        before: current.failureCode,
        after: input.failureCode ?? null,
      },
    },
  });
  return tx.catalogueImportOperation.findUniqueOrThrow({
    where: { id: current.id },
  });
}
export type IngestionRepository = ReturnType<typeof createIngestionRepository>;
