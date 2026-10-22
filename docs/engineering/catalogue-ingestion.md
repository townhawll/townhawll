# Catalogue ingestion backend

`@townhawll/content` owns import validation, duplicate checks and execution
tracking. `@townhawll/integrations` still owns provider requests, normalization
and recommendations. `@townhawll/audit` records durable staff-action evidence.
None of these services publishes titles or processes media.

## Boundaries and usage

Admin server code uses `apps/admin/src/lib/catalogue-ingestion.ts`, which binds
the content service to the existing request-aware staff guard. Obtain its
request context with `catalogueImportContext()`. Never accept actor IDs or roles
from form data. Server Actions and Route Handlers retain the framework's normal
origin/CSRF protections.

The service exposes `validate`, `checkDuplicates`, `begin`, `getOperation` and
`transition`. Submissions contain a provider candidate, explicitly supplied
canonical type/name/slug, selected candidate keys and optional confirmed Steam
supplementation. Validation returns blocking errors, warnings and missing
optional fields. A structurally valid submission is **not editorial approval**,
and does not prove provider data is authentic. Future review handlers must
reconstruct accepted data from trusted server-held provider/review state and
validate it again before saving.

Provider candidate, editorial draft, execution record, canonical title and
media-processing state are separate concepts. The current operation stores
identity and a request fingerprint, not a resumable candidate/draft payload.
Durable review state and canonical persistence remain to be implemented. In
particular, `SUCCEEDED` means the catalogue save succeeded, never that media is
READY, active or published.

## Permissions

- Creating/validating imports and checking duplicates require `content.create`
  (CONTENT_EDITOR, ADMIN or OWNER under the current role map).
- Editors may inspect/cancel their own operations. `operations.read` permits
  operational inspection across actors.
- Retrying a retryable failure requires `operations.retryJob`; cross-actor
  cancellation requires `operations.cancelJob`.
- Starting/completing an execution requires `content.create`. TECHNICAL_ADMIN
  does not gain editorial or publishing permission through operational access.

The app's guard checks the verified, active account and reloads staff
assignments. Every service call authorizes again; private records are checked
for ownership/scope. Repository exports are trusted server internals, not public
request handlers. Navigation is never an authorization boundary.

## Identity, duplicates and concurrency

Primary imports use TMDB `movie`/`series` or IGDB `game` identities. Steam is
supplementary. Existing qualified provider mappings remain authoritative for
exact duplicates, including secondary identities. TMDB movie and series IDs
occupy distinct namespaces.

Possible matches use normalized names/original names/aliases, title type and
known release years/days. Different known years exclude name-only remakes;
missing dates remain unknown. Deleted titles remain visible to duplicate
protection. An indexed SQL prefilter bounds candidate work; the shared Unicode
comparison rules determine final matches. Truncated results fail closed for
review. Possible matches never merge automatically.

Idempotency is scoped to `(actorId, IMPORT_TITLE, idempotencyKey)`. Repeating
the same validated payload returns its existing operation, including terminal
results. Reusing a key for a changed fingerprint fails. Use a new key for a
deliberate new operation; use the retry transition for an existing retryable
failure.

A PostgreSQL partial unique index reserves each qualified primary identity while
PENDING or RUNNING, across all actors. Compare-and-swap versions protect
transitions. Failed/cancelled operations release that reservation; retrying
reacquires it. These protections do not replace the catalogue's provider-mapping
uniqueness constraints. Canonical persistence must recheck duplicates and
atomically create the title/mappings, append audit evidence and call
`transitionImportOperation` using the **same Prisma transaction**. No
process-local lock provides correctness.

## Execution lifecycle

```text
PENDING -> RUNNING -> SUCCEEDED
    |         |  -> FAILED -> PENDING (retryable failures only)
    |         |       |
    +---------+-------+-> CANCELLED
```

New operations start PENDING with zero attempts. RUNNING increments attempts and
sets the start time. Terminal states have completion timestamps; success must
reference a title with matching type and primary provider mapping. Failure
stores a fixed safe code, never a provider/database error message. PostgreSQL
checks/triggers enforce immutable identity, versions, transitions and coherent
timestamps. There is no scheduler, lease or automatic recovery yet; abandoned
executions will need explicit operational handling.

## Audit and errors

Operation changes and success audit records commit together. Failed attempts are
recorded separately after rollback. If the separate failure audit write also
fails, the shared logger records a safe correlation event; it cannot guarantee
durable failure evidence while PostgreSQL is unavailable.

Audit events capture actor/role snapshot, action, target, result, reason,
timestamp, correlation ID and allowlisted before/after values.
Staff/moderation/system/feature-flag actions require a reason. Extend that
explicit policy when adding other dangerous actions. Never pass raw requests,
credentials, tokens, image bytes or provider errors. Shared redaction runs
before strict validation.

The audit API provides inserts only. A database trigger rejects UPDATE, DELETE
and TRUNCATE, even for an application OWNER. Database administrators can change
schema/disable triggers; deployment database privileges must protect that
boundary. Actor/title deletion is restricted where durable operation/audit
evidence references them.

Public service errors use fixed codes/messages. Unexpected transient failures
use shared Pino logging with safe actor/request IDs. The existing Redis limiter
caps per-actor import requests; Redis is not the durable idempotency or
reservation store.

## Migration and verification

Migration: `20261022000000_create_ingestion_and_audit`. It adds import/audit
tables, constraints, transition/append-only triggers and duplicate-name
expression indexes. Existing catalogue/auth records are preserved. Apply
committed migrations through the existing local `pnpm db:migrate` workflow;
never use `db push`.

Normal checks:

```sh
pnpm --filter @townhawll/db exec prisma validate
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Database tests require `TOWNHAWLL_DB_INTEGRATION=1` and a **disposable local
database whose name ends in `_test`**. Apply migrations with
`pnpm --filter @townhawll/db exec prisma migrate deploy`, then run
`pnpm --filter @townhawll/content test`. Tests insert immutable audit evidence,
so recreate the disposable database between clean runs rather than trying to
delete audit rows. CI already provisions and migrates a disposable PostgreSQL
database.

The database suite exercises real unique-index races, idempotent replay,
optimistic versions, retry reservations, transaction rollback and immutable
audit history. Unit tests cover validation, duplicate heuristics, permissions
and safe errors. These guarantees cover this foundation, not a future complete
import transaction or distributed media workflow.
