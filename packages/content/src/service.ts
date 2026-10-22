import { recordAuditEvent } from "@townhawll/audit/server";
import type { AuditEventInput } from "@townhawll/audit";
import type { StaffContext } from "@townhawll/auth/staff-context";
import { takeRateLimit, type RateLimitResult } from "@townhawll/cache";
import { createLogger } from "@townhawll/observability/logger";
import { z } from "zod";

import {
  canonicalIdSchema,
  idempotencyKeySchema,
  importContextSchema,
  transitionInputSchema,
} from "./contracts.ts";
import {
  requireImportCreation,
  requireImportInspection,
  requireImportRead,
} from "./authorization.ts";
import { CatalogueImportError, safeImportError } from "./errors.ts";
import {
  createIngestionRepository,
  type IngestionRepository,
} from "./repository.ts";
import {
  validateImportSubmission,
  type ValidatedImportSubmission,
} from "./validation.ts";

interface Dependencies {
  // Bind to the app's request-aware guard, never to userId/roles from request input.
  requireStaff(): Promise<StaffContext>;
  repository?: IngestionRepository;
  rateLimit?: (input: {
    namespace: string;
    signal: string;
    limit: number;
    windowSeconds: number;
  }) => Promise<RateLimitResult>;
  auditFailure?: (input: AuditEventInput) => Promise<unknown>;
  logger?: Pick<ReturnType<typeof createLogger>, "error" | "warn">;
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new CatalogueImportError("VALIDATION_FAILED");
  return result.data;
}
function submission(input: unknown): ValidatedImportSubmission {
  const result = validateImportSubmission(input);
  if (!result.valid) throw new CatalogueImportError("VALIDATION_FAILED");
  return result.data;
}

export function createCatalogueIngestionService(dependencies: Dependencies) {
  const logger = dependencies.logger ?? createLogger("content.ingestion");
  let repositoryPromise: Promise<IngestionRepository> | undefined;
  const repository = () =>
    (repositoryPromise ??= dependencies.repository
      ? Promise.resolve(dependencies.repository)
      : import("@townhawll/db").then(({ db }) =>
          createIngestionRepository(db),
        ));
  async function run<T>(
    action: string,
    rawContext: unknown,
    execute: (staff: StaffContext, requestId: string) => Promise<T>,
  ): Promise<T> {
    const staff = await dependencies.requireStaff();
    const { requestId } = parse(importContextSchema, rawContext);
    try {
      return await execute(staff, requestId);
    } catch (error) {
      const safe = safeImportError(error);
      const fields = {
        event: "catalogue.import.failure",
        code: safe.code,
        userId: staff.userId,
        requestId,
      };
      if (safe.retryable)
        logger.error(fields, "Catalogue import operation failed.");
      try {
        await (dependencies.auditFailure ?? recordAuditEvent)({
          actorId: staff.userId,
          actorRoles: [...staff.roles],
          action,
          targetType: "catalogueImport",
          targetId: null,
          result: safe.code === "UNAUTHORIZED" ? "DENIED" : "FAILURE",
          changes: { failureCode: { before: null, after: safe.code } },
          requestId,
        });
      } catch {
        logger.error(
          { ...fields, event: "audit.record_failed" },
          "Failed to record separate failure audit evidence.",
        );
      }
      throw safe;
    }
  }
  async function limit(staff: StaffContext) {
    const result = await (dependencies.rateLimit ?? takeRateLimit)({
      namespace: "catalogue-import",
      signal: staff.userId,
      limit: 30,
      windowSeconds: 60,
    });
    if (!result.allowed) throw new CatalogueImportError("RATE_LIMITED");
  }
  return {
    validate: (input: unknown, context: unknown) =>
      run("catalogue.import.validated", context, (staff) => {
        requireImportCreation(staff);
        return Promise.resolve(validateImportSubmission(input));
      }),
    checkDuplicates: (input: unknown, context: unknown) =>
      run("catalogue.import.duplicatesChecked", context, async (staff) => {
        requireImportCreation(staff);
        await limit(staff);
        return (await repository()).checkDuplicates(submission(input));
      }),
    begin: (input: unknown, rawKey: unknown, context: unknown) =>
      run("catalogue.import.requested", context, async (staff, requestId) => {
        requireImportCreation(staff);
        await limit(staff);
        return (await repository()).begin(
          staff,
          submission(input),
          parse(idempotencyKeySchema, rawKey),
          requestId,
        );
      }),
    getOperation: (rawId: unknown, context: unknown) =>
      run("catalogue.import.inspected", context, async (staff) => {
        requireImportInspection(staff);
        const operation = await (
          await repository()
        ).findOperation(parse(canonicalIdSchema, rawId));
        if (!operation) throw new CatalogueImportError("NOT_FOUND");
        requireImportRead(staff, operation);
        return operation;
      }),
    transition: (input: unknown, context: unknown) =>
      run(
        "catalogue.import.transitioned",
        context,
        async (staff, requestId) => {
          requireImportInspection(staff);
          await limit(staff);
          return (await repository()).transition(
            staff,
            parse(transitionInputSchema, input),
            requestId,
          );
        },
      ),
  };
}
