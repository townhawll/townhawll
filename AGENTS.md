# TownHawll Development Guide for AI Agents

You are a senior TownHawll engineer working in a pnpm + Turborepo monorepo. Prioritize type safety, security, data integrity, small reviewable diffs, and consistency with existing architecture.

## Do

- Read this file and relevant repo docs before architecture-sensitive work.
- Inspect existing code before creating new patterns or abstractions.
- Keep UI, Route Handlers, and Server Actions thin.
- Put reusable business rules in shared domain services.
- Keep database access behind the established database/repository boundary.
- Put TMDB, IGDB/Twitch, Steam, AI, email, storage, and other providers behind adapters.
- Validate untrusted input and provider responses with Zod or the established validation layer.
- Enforce authentication, account state, permissions, ownership, and feature rules on the server.
- Use TownHawll-generated IDs as canonical identity.
- Treat `Title` as the canonical identity for games, movies, and shows.
- Treat provider IDs as mappings, never as TownHawll primary identity.
- Normalize provider data before normal application code consumes it.
- Store permanent authoritative state in PostgreSQL.
- Use Redis only for temporary state.
- Store file/media bytes in object storage and references/metadata in PostgreSQL.
- Use Cloudflare Queues/Workers for slow or retryable work when needed.
- Make jobs idempotent where duplicate execution could produce incorrect state.
- Use the shared logger from `packages/observability`.
- Use committed Prisma migrations for schema changes.
- Add tests around important business rules, authorization, data integrity, retries, and regressions.
- Keep changes focused; avoid unrelated refactors.

## Don't

- Never commit secrets, API keys, passwords, tokens, OTPs, `.env` files, or production credentials.
- Never expose privileged server data to client code.
- Never rely on hidden UI as an authorization boundary.
- Never access PostgreSQL, Redis, R2, provider secrets, or AI providers directly from browser code.
- Never use provider IDs or slugs as canonical primary identity.
- Never make public catalogue pages depend on live provider requests.
- Never let Redis, queues, caches, provider APIs, or AI output become the only copy of important permanent state.
- Never store large binary files or Base64 media directly in PostgreSQL without an exceptional reason.
- Never put reusable business logic in React components, pages, Route Handlers, or Server Actions.
- Never duplicate domain logic between `apps/web`, `apps/admin`, and workers.
- Never call Better Stack, Cloudflare log export, or another log transport directly from feature/domain code.
- Never log secrets, session/auth tokens, private raw payloads, or sensitive moderation data.
- Never use `prisma db push` as the production migration strategy.
- Never introduce Express, microservices, WebSockets, a production Python AI service, or new infrastructure without a real requirement.
- Never weaken types, validation, authorization, or tests just to make code pass.
- Never commit, push, deploy, run production migrations, or modify production data unless explicitly instructed.

## Architecture

Normal server-side flow:

```text
UI / Route / Server Action
→ validation
→ authorization
→ domain service
→ repository or provider adapter
→ PostgreSQL / external service
```

Keep transport/UI code thin. Shared business rules belong in shared server-side packages.

### Application boundaries

`apps/web`
- Public and authenticated user-facing Next.js app.
- Owns rendering, routing, sessions, request handling, and user-facing orchestration.
- Does not own reusable domain rules or long-running jobs.

`apps/admin`
- Staff/admin Next.js app.
- Owns content management/imports, moderation, users, AI verification, job controls, audit views, and operations.
- Reuses shared domain services.
- Rechecks permissions server-side.

`apps/workers`
- Cloudflare Worker runtimes.
- Owns queue consumers, cron handlers, and background processing.

Do not introduce microservices or duplicate domain logic between apps.

## Project Structure

```text
apps/
├── web/
├── admin/
└── workers/

packages/
├── database/
├── auth/
├── ui/
├── config/
├── validators/
├── cache/
├── queue/
├── storage/
├── email/
├── notifications/
├── content/
├── reviews/
├── collections/
├── gamification/
├── moderation/
├── integrations/
├── search/
├── ai/
├── observability/
├── typescript-config/
└── eslint-config/

tooling/
docs/
.github/
```

Do not pre-create every future package. Add concrete packages when their feature/infrastructure boundary is actually needed.

## Catalogue & Data Rules

- `Title` is the shared canonical identity for `GAME`, `MOVIE`, and `SHOW`.
- Keep type-specific game/movie/show data outside the shared `Title` model where appropriate.
- Reviews, ratings, collections, and library entries generally reference `Title`.
- `ProviderMapping` connects TownHawll entities to external providers.
- Important provider, AI, and admin-derived values should preserve enough provenance for safe refresh/override.

Provider ingestion must follow:

```text
Provider
→ Adapter
→ Validate
→ Normalize
→ TownHawll schema
→ PostgreSQL
```

Primary V1 integrations:
- TMDB
- IGDB / Twitch
- Steam Web API

Public catalogue pages use stored TownHawll data. Provider outages should degrade gracefully using stored data plus appropriate retry/backoff.

## Persistence

- PostgreSQL is the permanent source of truth.
- Redis is temporary infrastructure only: rate limits, short caches, locks, idempotency, quotas, temporary counters.
- If deleting Redis would permanently lose important data, that state belongs in PostgreSQL.
- Store media bytes in Cloudflare R2; PostgreSQL stores object keys, relationships, and metadata.
- Use one logical Prisma schema split into domain-oriented files as it grows.
- Do not create one Prisma file per table.
- Most mutable persistent entities should use `createdAt` and `updatedAt`.
- Use `deletedAt` only when restore/moderation/history needs it.
- Schema changes require committed migrations.
- Treat migrations affecting existing production data as plan-first work.

## Authentication & Authorization

Account classes:
- Visitor
- Verified User
- Staff User

Staff roles:
- `CONTENT_EDITOR`
- `MODERATOR`
- `ADMIN`
- `TECHNICAL_ADMIN`
- `OWNER`

Staff may hold multiple roles. Effective permissions are the union of assigned roles. `OWNER` grants all permissions.

Every protected server operation should verify, as relevant:
1. Authentication.
2. Verification/account status.
3. Required permission.
4. Resource ownership or allowed scope.
5. Feature-specific rules.

Prefer centralized helpers such as:
- `requireUser()`
- `requireVerifiedUser()`
- `requirePermission()`
- `requireOwnership()`

Middleware is only an initial route guard. Exact authorization belongs inside the protected server operation.

Dangerous actions may require explicit confirmation, a mandatory reason, and an append-only audit record.

## Audit & Observability

Important staff/moderation operations use append-only audit logs where required.

Audit records should contain useful actor/action/target/result/reason/context information while excluding secrets and sensitive raw data.

Application/runtime telemetry must use `packages/observability`.

Useful structured log context can include:
- `event`
- `service`
- `environment`
- `requestId`
- `jobId`
- safe actor/entity IDs
- provider
- duration
- release/version

Sentry is for errors, stack traces, and appropriate sampled tracing/performance data.

Platform logs are telemetry, not business/audit state.

## Background Jobs

Selected V1 infrastructure:
- Cloudflare Queues
- Cloudflare Workers
- Cloudflare Cron Triggers

Typical jobs:
- content import/hydration and refresh
- Steam sync
- notifications
- XP/achievement processing
- AI enrichment/embeddings
- cleanup/exports

Rules:
- Queue messages are transport, not permanent state.
- Define idempotency, retry/backoff, timeout, batch size, and terminal failure behavior per job.
- Do not force one retry policy onto every workload.
- Avoid keeping users waiting for slow provider-dependent work that can run asynchronously.

## AI Boundaries

TownHawll V1 is TypeScript-first for production AI orchestration.

TypeScript owns hosted model calls, RAG/tool orchestration, structured outputs, routing, context, quotas, and streaming.

Use HTTP streaming / `ReadableStream` with SSE-style events where useful.

Do not add a production Python AI service unless a real workload requires custom inference, trained recommenders/rankers, classifiers, fine-tuned models, or Python-native ML serving.

AI tools must use normal server-side validation, authorization, limits, and audit rules. AI must not bypass permissions.

## Deployment Boundaries

Current direction:
- MVP/private testing: `apps/web` and `apps/admin` may run on Vercel.
- Cloudflare may independently provide DNS, R2, Queues, Workers/Cron, Turnstile, and related security infrastructure.
- Before Public Beta, validate representative OpenNext/Cloudflare builds.
- Move web/admin to Cloudflare Workers Paid only if compatibility and bundle constraints are acceptable.
- Deployment provider choices must not leak into domain architecture.
- Do not create arbitrary multi-worker splits just to work around bundle limits.

## Scope Discipline

Current MVP focus:
- auth/accounts/onboarding
- catalogue/content integration
- title pages
- search/browse
- ratings/reviews
- library/status tracking
- collections
- profiles
- reporting/blocking
- core admin/content import
- moderation
- selected precomputed title intelligence
- baseline CI/observability/reliability

Do not pull deferred systems into MVP unless explicitly requested.

Examples:
- full XP/achievements/leaderboards
- full notifications
- Squad Finder
- Awards
- full AI assistant/RAG
- full AI tools platform
- advanced semantic/personalized search
- TownHawll Plus
- mature affiliate/price systems

Design feature-specific schemas, permissions, workflows, abuse controls, caching, pagination, loading, and failure states shortly before implementing that feature.

## Testing

Use tests based on risk, not arbitrary coverage percentages.

- Unit: deterministic domain logic such as permissions, normalization, calculations, validation.
- Integration: repositories/database behavior, Server Actions/Route Handlers, provider adapters, queue handlers.
- E2E: critical auth, catalogue/title, review/rating, collection, and admin import/moderation flows.

When fixing a meaningful bug, add a regression test when practical.

## Commands

Use the actual repository scripts once bootstrap is complete. Expected root commands will generally be:

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Do not invent commands here that do not exist in `package.json`.

## Boundaries

### Always do
- Read nearby code before editing.
- Follow established architecture/naming.
- Validate untrusted input.
- Enforce protected actions server-side.
- Keep provider-specific code behind adapters.
- Keep permanent state in PostgreSQL.
- Run relevant tests/type checks before concluding.
- Inspect the final diff for unrelated changes.
- Report migrations, env changes, dependencies, and follow-ups.

### Plan first
- auth/session changes
- roles/permissions
- canonical catalogue identity
- provider normalization architecture
- schema changes affecting existing data
- destructive admin/moderation operations
- queue/job contracts
- security-sensitive flows
- production deployment/migrations
- AI account actions
- subscriptions/payments/entitlements

### Never do
- Commit, push, deploy, or modify production data without explicit instruction.
- Force push shared branches.
- Commit secrets or `.env` files.
- Bypass authorization to simplify development.
- Rewrite unrelated architecture during a feature task.
- Modify generated files unless repo docs say they are editable.
- Weaken tests just to make an implementation pass.

## Before Finishing

Check the relevant subset:

- [ ] requested behavior works
- [ ] typecheck passes
- [ ] relevant tests pass
- [ ] lint passes where applicable
- [ ] build passes when runtime/build behavior changed
- [ ] authorization is server-side
- [ ] relevant loading/error/empty states exist
- [ ] retry/idempotency behavior is safe where needed
- [ ] no secrets/sensitive values are logged
- [ ] no unrelated changes are included
- [ ] migrations are included if required
- [ ] `.env.example` is updated if configuration changed

Then summarize:
- what changed
- checks run
- migrations
- environment-variable changes
- new dependencies
- architecture decisions/follow-ups

## When Stuck

- Inspect nearby implementations before inventing a pattern.
- Prefer a short plan over speculative broad edits.
- Ask when a genuine product/architecture decision is missing.
- Do not treat old TownHawll research as current implementation guidance.
- If current repo docs conflict with older plans, follow the newer approved decision and flag the conflict.

## Source of Truth

The current repository and approved TownHawll documentation are the source of truth.

Keep this root file high-signal. Put detailed feature-specific rules in `docs/` or future scoped agent files instead of continuously expanding `AGENTS.md`.
