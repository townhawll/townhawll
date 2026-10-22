import { describe, expect, it, vi } from "vitest";
import { createCatalogueIngestionService } from "./service.ts";
import { assertImportTransition } from "./lifecycle.ts";
import {
  IMPORT_ERRORS,
  CatalogueImportError,
  safeImportError,
} from "./errors.ts";
import { staffFixture, submissionFixture } from "./fixtures.ts";
import type { IngestionRepository } from "./repository.ts";

const context = { requestId: "request-fixture-123" };
function setup(roles: Parameters<typeof staffFixture>[1] = ["CONTENT_EDITOR"]) {
  const staff = staffFixture("staff-fixture", roles);
  const requireStaff = vi.fn(() => Promise.resolve(staff));
  const repository = {
    begin: vi.fn<IngestionRepository["begin"]>(),
    transition: vi.fn<IngestionRepository["transition"]>(),
    findOperation: vi.fn<IngestionRepository["findOperation"]>(),
    checkDuplicates: vi.fn<IngestionRepository["checkDuplicates"]>(),
  } satisfies IngestionRepository;
  const rateLimit = vi.fn(() =>
    Promise.resolve({
      allowed: true,
      remaining: 29,
      retryAfterSeconds: 1,
    }),
  );
  const auditFailure = vi.fn(() => Promise.resolve(undefined)),
    logger = { error: vi.fn(), warn: vi.fn() };
  return {
    service: createCatalogueIngestionService({
      requireStaff,
      repository,
      rateLimit,
      auditFailure,
      logger,
    }),
    repository,
    rateLimit,
    auditFailure,
    logger,
    requireStaff,
  };
}
describe("ingestion authorization and safe failures", () => {
  it("denies operation inspection and transitions before querying private state for non-operational staff", async () => {
    const { service, repository } = setup(["MODERATOR"]);
    await expect(
      service.getOperation("unknown", context),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      service.transition(
        { operationId: "unknown", expectedVersion: 0, status: "RUNNING" },
        context,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(repository.findOperation).not.toHaveBeenCalled();
    expect(repository.transition).not.toHaveBeenCalled();
  });
  it.each(
    ([[], ["MODERATOR"], ["TECHNICAL_ADMIN"]] as const).map((roles) => ({
      roles,
    })),
  )(
    "denies import creation for $roles before calling repositories",
    async ({ roles }) => {
      const { service, repository, rateLimit, auditFailure } = setup([
        ...roles,
      ]);
      await expect(
        service.begin(submissionFixture(), "request-key-123", context),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      expect(repository.begin).not.toHaveBeenCalled();
      expect(rateLimit).not.toHaveBeenCalled();
      expect(auditFailure).toHaveBeenCalledWith(
        expect.objectContaining({ result: "DENIED" }),
      );
    },
  );
  it.each(["CONTENT_EDITOR", "ADMIN", "OWNER"] as const)(
    "uses existing permissions for %s",
    async (role) => {
      const { service, requireStaff } = setup([role]);
      expect((await service.validate(submissionFixture(), context)).valid).toBe(
        true,
      );
      expect(requireStaff).toHaveBeenCalledOnce();
    },
  );
  it("reloads authorization on each operation, including after role revocation", async () => {
    const { service, requireStaff } = setup();
    expect((await service.validate(submissionFixture(), context)).valid).toBe(
      true,
    );
    requireStaff.mockResolvedValue(staffFixture("staff-fixture", []));
    await expect(
      service.validate(submissionFixture(), context),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(requireStaff).toHaveBeenCalledTimes(2);
  });
  it("applies shared per-actor rate limits before reserving an import", async () => {
    const { service, repository, rateLimit } = setup();
    rateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });
    await expect(
      service.begin(submissionFixture(), "request-key-123", context),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(repository.begin).not.toHaveBeenCalled();
    expect(rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ signal: "staff-fixture", limit: 30 }),
    );
  });
  it("rejects actor/role injection and invalid keys without exposing raw payloads", async () => {
    const { service, repository, auditFailure } = setup();
    await expect(
      service.begin(
        {
          ...submissionFixture(),
          actorId: "other",
          password: "private-password",
        },
        "request-key-123",
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      service.begin(submissionFixture(), "bad", context),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(repository.begin).not.toHaveBeenCalled();
    expect(JSON.stringify(auditFailure.mock.calls)).not.toContain(
      "private-password",
    );
  });
  it("sanitizes database failures and separately records failure evidence", async () => {
    const { service, repository, auditFailure, logger } = setup();
    repository.begin.mockRejectedValue(
      new Error("password=private-token postgres://secret"),
    );
    await expect(
      service.begin(submissionFixture(), "request-key-123", context),
    ).rejects.toMatchObject({
      code: "DATABASE_UNAVAILABLE",
      message: IMPORT_ERRORS.DATABASE_UNAVAILABLE,
      retryable: true,
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(
      /private-token|postgres/,
    );
    expect(JSON.stringify(auditFailure.mock.calls)).not.toMatch(
      /private-token|postgres/,
    );
    expect(auditFailure).toHaveBeenCalledWith(
      expect.objectContaining({ result: "FAILURE" }),
    );
  });
  it("never attaches raw messages or causes to structured errors", () => {
    for (const code of Object.keys(
      IMPORT_ERRORS,
    ) as (keyof typeof IMPORT_ERRORS)[]) {
      expect(new CatalogueImportError(code).message).toBe(IMPORT_ERRORS[code]);
      expect(new CatalogueImportError(code).cause).toBeUndefined();
    }
    expect(safeImportError(new Error("secret")).message).not.toContain(
      "secret",
    );
  });
});
describe("import lifecycle", () => {
  it.each([
    ["PENDING", "RUNNING"],
    ["PENDING", "CANCELLED"],
    ["RUNNING", "FAILED"],
    ["RUNNING", "SUCCEEDED"],
    ["RUNNING", "CANCELLED"],
    ["FAILED", "PENDING"],
    ["FAILED", "CANCELLED"],
  ] as const)(
    "allows %s to %s with coherent completion data",
    (current, status) => {
      expect(() =>
        assertImportTransition(current, {
          operationId: "operation",
          expectedVersion: 0,
          status,
          ...(status === "SUCCEEDED" ? { resultTitleId: "title" } : {}),
          ...(status === "FAILED"
            ? { failureCode: "DATABASE_UNAVAILABLE" as const }
            : {}),
        }),
      ).not.toThrow();
    },
  );
  it.each([
    ["PENDING", "SUCCEEDED"],
    ["SUCCEEDED", "RUNNING"],
    ["CANCELLED", "PENDING"],
    ["RUNNING", "RUNNING"],
  ] as const)("denies %s to %s", (current, status) => {
    expect(() =>
      assertImportTransition(current, {
        operationId: "operation",
        expectedVersion: 0,
        status,
      }),
    ).toThrow(CatalogueImportError);
  });
  it("requires success/failure details only in their matching states", () => {
    expect(() =>
      assertImportTransition("RUNNING", {
        operationId: "operation",
        expectedVersion: 0,
        status: "SUCCEEDED",
      }),
    ).toThrow();
    expect(() =>
      assertImportTransition("PENDING", {
        operationId: "operation",
        expectedVersion: 0,
        status: "RUNNING",
        resultTitleId: "title",
      }),
    ).toThrow();
  });
});
