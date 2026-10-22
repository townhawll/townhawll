import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAuditEvent, appendAuditEvent } from "@townhawll/audit/server";
import { providerMappingKey } from "@townhawll/integrations/identity";
import type { StaffRole } from "@townhawll/db";

import {
  createIngestionRepository,
  transitionImportOperation,
  type ImportOperation,
} from "./repository.ts";
import { createCatalogueIngestionService } from "./service.ts";
import { staffFixture, validFixture } from "./fixtures.ts";

const enabled = process.env.TOWNHAWLL_DB_INTEGRATION === "1";
if (enabled) {
  let safe = false;
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    safe =
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.pathname.endsWith("_test");
  } catch {
    /* Fail closed without echoing credentials. */
  }
  if (!safe)
    throw new Error(
      "Ingestion integration tests require a local *_test database.",
    );
}
let db: typeof import("@townhawll/db").db;
let repository: ReturnType<typeof createIngestionRepository>;
const requestId = () => randomUUID();
const key = () => randomUUID();
const fixture = (
  type: "MOVIE" | "SERIES" | "GAME" = "MOVIE",
  title = `Ingestion ${randomUUID()}`,
) => validFixture(String(randomInt(1_000_000, 2_000_000_000)), type, title);
async function actor(roles: StaffRole[] = ["CONTENT_EDITOR"]) {
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      emailVerified: new Date(),
      staffRoleAssignments: { create: roles.map((role) => ({ role })) },
    },
  });
  return staffFixture(user.id, roles);
}
async function start(staff: Awaited<ReturnType<typeof actor>>) {
  const input = fixture();
  const { operation } = await repository.begin(
    staff,
    input,
    key(),
    requestId(),
  );
  return { input, operation };
}
async function move(
  staff: Awaited<ReturnType<typeof actor>>,
  operation: ImportOperation,
  status: "RUNNING" | "FAILED" | "CANCELLED" | "PENDING",
  failureCode?: "DATABASE_UNAVAILABLE" | "VALIDATION_FAILED",
) {
  return repository.transition(
    staff,
    {
      operationId: operation.id,
      expectedVersion: operation.version,
      status,
      ...(failureCode ? { failureCode } : {}),
    },
    requestId(),
  );
}

describe.skipIf(!enabled)("ingestion PostgreSQL guarantees", () => {
  beforeAll(async () => {
    ({ db } = await import("@townhawll/db"));
    await db.$connect();
    repository = createIngestionRepository(db);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it("separates exact TMDB movie/series mappings and detects secondary Steam identities", async () => {
    const input = fixture();
    const mapping = providerMappingKey(input.candidate.title.identity);
    const existing = await db.title.create({
      data: {
        type: "MOVIE",
        title: "Exact duplicate",
        slug: key(),
        providerMappings: { create: mapping },
      },
    });
    expect((await repository.checkDuplicates(input)).exact[0]?.titleId).toBe(
      existing.id,
    );
    const series = validFixture(
      input.candidate.title.identity.id,
      "SERIES",
      `Series ${key()}`,
    );
    expect((await repository.checkDuplicates(series)).exact).toEqual([]);
    const game = fixture("GAME");
    const origin = game.candidate.title.mappings[0]!;
    const steamId = String(randomInt(100_000_000, 2_000_000_000));
    game.candidate.title.mappings.push({
      ...origin,
      identity: { provider: "STEAM", entity: "app", id: steamId },
    });
    const stored = await db.title.create({
      data: {
        type: "GAME",
        title: "Steam duplicate",
        slug: key(),
        providerMappings: {
          create: { provider: "STEAM", providerId: `app:${steamId}` },
        },
      },
    });
    expect((await repository.checkDuplicates(game)).exact[0]?.titleId).toBe(
      stored.id,
    );
    // A reviewed supplement may be selected from confirmed evidence before a mapping is accepted.
    game.gameSupplement = {
      identity: { provider: "STEAM", entity: "app", id: steamId },
      name: { state: "missing", reason: "NOT_PROVIDED" },
      appType: "GAME",
      sourceAppType: "game",
      requestedCountryCode: "US",
      requestedLanguageCode: "en",
      platformSupport: (["WINDOWS", "MACOS", "LINUX"] as const).map(
        (platform) => ({
          platform,
          supported: { state: "missing", reason: "NOT_PROVIDED" },
        }),
      ),
      systemRequirements: { state: "missing", reason: "NOT_PROVIDED" },
      provenance: {
        ...origin,
        identity: { provider: "STEAM", entity: "app", id: steamId },
      },
      issues: [],
    };
    game.candidate.title.mappings = [origin];
    expect((await repository.checkDuplicates(game)).exact[0]?.titleId).toBe(
      stored.id,
    );
    await expect(
      repository.begin(await actor(), input, key(), requestId()),
    ).rejects.toMatchObject({ code: "EXACT_DUPLICATE" });
  });
  it("finds normalized names and aliases, ignores sequels/type/year collisions, and reports evidence", async () => {
    const name = `Café—Adventure ${key()}`;
    const input = fixture("MOVIE", name);
    input.candidate.title.primaryReleaseDate = {
      state: "known",
      value: { precision: "DAY", date: "2020-01-02" },
      certainty: "PROVIDED",
      evidence: [],
      provenance: input.candidate.title.mappings[0]!,
    };
    const matched = await db.title.create({
      data: {
        type: "MOVIE",
        title: name.toUpperCase().replace("—", " "),
        slug: key(),
        primaryReleaseDate: new Date("2020-01-02"),
        deletedAt: new Date(),
      },
    });
    const alias = await db.title.create({
      data: {
        type: "MOVIE",
        title: "Different Name",
        slug: key(),
        aliases: { create: { name, normalizedKey: name.toLowerCase() } },
      },
    });
    await db.title.createMany({
      data: [
        {
          type: "MOVIE",
          title: name,
          slug: key(),
          primaryReleaseDate: new Date("1933-01-01"),
        },
        { type: "SERIES", title: name, slug: key() },
        { type: "MOVIE", title: `${name} II`, slug: key() },
      ],
    });
    const result = await repository.checkDuplicates(input);
    expect(result.possible.map((match) => match.titleId).sort()).toEqual(
      [matched.id, alias.id].sort(),
    );
    const matchedResult = result.possible.find(
      (match) => match.titleId === matched.id,
    );
    expect(matchedResult?.deleted).toBe(true);
    expect(matchedResult?.evidence).toContainEqual({
      kind: "RELEASE_DAY",
      value: "2020-01-02",
    });
    await expect(
      repository.begin(await actor(), input, key(), requestId()),
    ).rejects.toMatchObject({ code: "POSSIBLE_DUPLICATE" });
  });
  it("replays matching requests and rejects conflicting key reuse without extra operation rows", async () => {
    const staff = await actor(),
      input = fixture(),
      idempotencyKey = key();
    const initial = await repository.begin(
      staff,
      input,
      idempotencyKey,
      requestId(),
    );
    const replay = await repository.begin(
      staff,
      structuredClone(input),
      idempotencyKey,
      requestId(),
    );
    expect(replay.replayed).toBe(true);
    expect(replay.operation.id).toBe(initial.operation.id);
    await expect(
      repository.begin(
        staff,
        { ...input, canonical: { ...input.canonical, title: "Changed title" } },
        idempotencyKey,
        requestId(),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(
      await db.adminAuditEvent.count({
        where: { targetId: initial.operation.id },
      }),
    ).toBe(1);
  });
  it("scopes idempotency keys by staff actor rather than globally", async () => {
    const idempotencyKey = key(),
      a = await actor(),
      b = await actor();
    const first = await repository.begin(
      a,
      fixture(),
      idempotencyKey,
      requestId(),
    );
    const second = await repository.begin(
      b,
      fixture(),
      idempotencyKey,
      requestId(),
    );
    expect(first.operation.id).not.toBe(second.operation.id);
  });
  it("concurrent matching replays resolve to one database operation and one audit entry", async () => {
    const staff = await actor(),
      input = fixture(),
      idempotencyKey = key();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        repository.begin(staff, input, idempotencyKey, requestId()),
      ),
    );
    expect(new Set(results.map((result) => result.operation.id)).size).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(
      await db.adminAuditEvent.count({
        where: { targetId: results[0]!.operation.id },
      }),
    ).toBe(1);
  });
  it("concurrent different staff cannot reserve the same provider identity twice", async () => {
    const a = await actor(),
      b = await actor(),
      input = fixture();
    const results = await Promise.allSettled([
      repository.begin(a, input, key(), requestId()),
      repository.begin(b, input, key(), requestId()),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure?.status === "rejected" && failure.reason).toMatchObject({
      code: "CONCURRENT_IMPORT",
    });
  });
  it("permits distinct TMDB movie/series reservations with equal numeric external IDs", async () => {
    const staff = await actor(),
      id = String(randomInt(1_000_000, 2_000_000_000));
    const results = await Promise.all([
      repository.begin(
        staff,
        validFixture(id, "MOVIE", `Movie ${key()}`),
        key(),
        requestId(),
      ),
      repository.begin(
        staff,
        validFixture(id, "SERIES", `Series ${key()}`),
        key(),
        requestId(),
      ),
    ]);
    expect(results[0].operation.id).not.toBe(results[1].operation.id);
  });
  it("uses version checks so concurrent transitions have a single winner", async () => {
    const staff = await actor(),
      { operation } = await start(staff);
    const results = await Promise.allSettled([
      move(staff, operation, "RUNNING"),
      move(staff, operation, "RUNNING"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { code: "CONCURRENT_MODIFICATION" } });
    expect(await repository.findOperation(operation.id)).toMatchObject({
      status: "RUNNING",
      version: 1,
      attemptCount: 1,
    });
    expect(
      await db.adminAuditEvent.count({ where: { targetId: operation.id } }),
    ).toBe(2);
  });
  it("supports scoped technical retries without granting editorial execution/publishing", async () => {
    const staff = await actor(),
      technical = await actor(["TECHNICAL_ADMIN"]),
      { operation } = await start(staff);
    const running = await move(staff, operation, "RUNNING");
    const failed = await move(staff, running, "FAILED", "DATABASE_UNAVAILABLE");
    const pending = await move(technical, failed, "PENDING");
    expect(pending).toMatchObject({
      status: "PENDING",
      attemptCount: 1,
      startedAt: null,
      completedAt: null,
      failureCode: null,
    });
    await expect(move(technical, pending, "RUNNING")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(await move(staff, pending, "RUNNING")).toMatchObject({
      attemptCount: 2,
    });
  });
  it("does not retry non-transient failures or reclaim an already-reserved identity", async () => {
    const staff = await actor(["OWNER"]),
      { input, operation } = await start(staff);
    const running = await move(staff, operation, "RUNNING");
    const failed = await move(staff, running, "FAILED", "DATABASE_UNAVAILABLE");
    await repository.begin(staff, input, key(), requestId());
    await expect(move(staff, failed, "PENDING")).rejects.toMatchObject({
      code: "CONCURRENT_IMPORT",
    });
    const other = await start(staff),
      otherRunning = await move(staff, other.operation, "RUNNING");
    const permanent = await move(
      staff,
      otherRunning,
      "FAILED",
      "VALIDATION_FAILED",
    );
    await expect(move(staff, permanent, "PENDING")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });
  it("keeps catalogue success, operation success and audit evidence atomic without media readiness", async () => {
    const staff = await actor(),
      { input, operation } = await start(staff),
      running = await move(staff, operation, "RUNNING");
    const createResult = async (
      tx: Parameters<typeof transitionImportOperation>[0],
    ) => {
      const title = await tx.title.create({
        data: {
          type: "MOVIE",
          title: input.canonical.title,
          slug: input.canonical.slug,
          movie: { create: {} },
          providerMappings: {
            create: providerMappingKey(input.candidate.title.identity),
          },
        },
      });
      return transitionImportOperation(
        tx,
        staff,
        {
          operationId: running.id,
          expectedVersion: running.version,
          status: "SUCCEEDED",
          resultTitleId: title.id,
        },
        requestId(),
      );
    };
    const abort = new Error("rollback result fixture");
    await expect(
      db.$transaction(async (tx) => {
        await createResult(tx);
        throw abort;
      }),
    ).rejects.toBe(abort);
    expect(
      await db.title.findUnique({ where: { slug: input.canonical.slug } }),
    ).toBeNull();
    expect((await repository.findOperation(operation.id))?.status).toBe(
      "RUNNING",
    );
    expect(
      await db.adminAuditEvent.count({ where: { targetId: operation.id } }),
    ).toBe(2);
    const saved = await db.$transaction(createResult);
    expect(saved.status).toBe("SUCCEEDED");
    expect(
      await db.mediaAsset.count({ where: { titleId: saved.resultTitleId } }),
    ).toBe(0);
    expect(
      await db.adminAuditEvent.count({ where: { targetId: operation.id } }),
    ).toBe(3);
    await expect(move(staff, saved, "RUNNING")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });
  it("rolls back reservations if their required audit write fails", async () => {
    const staff = await actor(),
      input = fixture(),
      idempotencyKey = key();
    await expect(
      repository.begin(staff, input, idempotencyKey, "bad"),
    ).rejects.toThrow("Invalid safe audit event");
    expect(
      await db.catalogueImportOperation.count({
        where: { actorId: staff.userId, idempotencyKey },
      }),
    ).toBe(0);
  });
  it("records failed attempts separately after an operation transaction rolls back", async () => {
    const staff = await actor(),
      input = fixture(),
      idempotencyKey = key();
    const service = createCatalogueIngestionService({
      requireStaff: () => Promise.resolve(staff),
      repository,
      rateLimit: () =>
        Promise.resolve({
          allowed: true,
          remaining: 1,
          retryAfterSeconds: 1,
        }),
    });
    await service.begin(input, idempotencyKey, { requestId: requestId() });
    const correlationId = requestId();
    await expect(
      service.begin(fixture(), idempotencyKey, { requestId: correlationId }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(
      await db.catalogueImportOperation.count({
        where: { actorId: staff.userId },
      }),
    ).toBe(1);
    expect(
      await db.adminAuditEvent.findFirst({
        where: { requestId: correlationId },
      }),
    ).toMatchObject({
      result: "FAILURE",
      changes: { failureCode: { before: null, after: "IDEMPOTENCY_CONFLICT" } },
    });
  });
  it("denies other editors' private operations while allowing scoped operations staff", async () => {
    const owner = await actor(),
      other = await actor(),
      { operation } = await start(owner);
    const service = (staff: ReturnType<typeof staffFixture>) =>
      createCatalogueIngestionService({
        requireStaff: () => Promise.resolve(staff),
        repository,
      });
    await expect(
      service(other).getOperation(operation.id, { requestId: requestId() }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const technical = await actor(["TECHNICAL_ADMIN"]);
    expect(
      (
        await service(technical).getOperation(operation.id, {
          requestId: requestId(),
        })
      ).id,
    ).toBe(operation.id);
  });
  it("database guards reject direct lifecycle/identity corruption and cross-title success", async () => {
    const staff = await actor(),
      { operation } = await start(staff);
    await expect(
      db.catalogueImportOperation.create({
        data: {
          actorId: staff.userId,
          provider: "TMDB",
          providerEntity: "movie",
          providerExternalId: String(randomInt(1_000_000, 2_000_000_000)),
          titleType: "MOVIE",
          idempotencyKey: key(),
          requestHash: "a".repeat(64),
          status: "CANCELLED",
          completedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/begin pending/);
    await expect(
      db.catalogueImportOperation.update({
        where: { id: operation.id },
        data: { status: "SUCCEEDED", version: 1, completedAt: new Date() },
      }),
    ).rejects.toThrow();
    await expect(
      db.catalogueImportOperation.update({
        where: { id: operation.id },
        data: { providerEntity: "series", version: 1 },
      }),
    ).rejects.toThrow();
    const running = await move(staff, operation, "RUNNING");
    const title = await db.title.create({
      data: { type: "MOVIE", title: "Unrelated", slug: key() },
    });
    await expect(
      repository.transition(
        staff,
        {
          operationId: running.id,
          expectedVersion: running.version,
          status: "SUCCEEDED",
          resultTitleId: title.id,
        },
        requestId(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
  it("audit history cannot be updated, deleted or truncated, including by OWNER", async () => {
    const staff = await actor(["OWNER"]);
    const event = await recordAuditEvent({
      actorId: staff.userId,
      actorRoles: [...staff.roles],
      action: "catalogue.import.tested",
      targetType: "catalogueImport",
      targetId: null,
      result: "SUCCESS",
      requestId: requestId(),
    });
    await expect(
      db.adminAuditEvent.update({
        where: { id: event.id },
        data: { reason: "mutated" },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.adminAuditEvent.delete({ where: { id: event.id } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.$executeRaw`TRUNCATE TABLE admin_audit_events`,
    ).rejects.toThrow(/append-only/);
    expect(
      await db.adminAuditEvent.findUnique({ where: { id: event.id } }),
    ).not.toBeNull();
    const abort = new Error("rollback audit fixture"),
      correlationId = requestId();
    await expect(
      db.$transaction(async (tx) => {
        await appendAuditEvent(tx, {
          actorId: staff.userId,
          actorRoles: [...staff.roles],
          action: "catalogue.import.tested",
          targetType: "catalogueImport",
          targetId: null,
          result: "SUCCESS",
          requestId: correlationId,
        });
        throw abort;
      }),
    ).rejects.toBe(abort);
    expect(
      await db.adminAuditEvent.count({ where: { requestId: correlationId } }),
    ).toBe(0);
  });
  it("database rejects privileged audit entries without a required reason", async () => {
    const staff = await actor(["OWNER"]);
    await expect(
      db.adminAuditEvent.create({
        data: {
          actorId: staff.userId,
          actorRoles: [...staff.roles],
          action: "staff.role.changed",
          targetType: "user",
          result: "SUCCESS",
          changes: {},
          requestId: requestId(),
        },
      }),
    ).rejects.toThrow();
  });
});
