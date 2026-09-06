# TownHawll Architecture

Last reviewed: 6 September 2026.

## Purpose and authority

This document summarizes the approved TownHawll architecture for implementation.
It describes the target boundaries, not a claim that every component already
exists. Read it alongside the root `AGENTS.md` and the relevant feature design
before changing architecture-sensitive code.

Use explicit approved decisions and stage-specific scope over historical notes
or illustrative folder trees. A newer edit timestamp alone does not establish
approval. Record and resolve material conflicts before implementing the affected
behavior. The Notion section **Research from when I didn't know shit** and all
its descendants are obsolete and are excluded from this reference.

The linked Notion documents are the source material. Exact schemas, provider
contracts, security parameters, and operational policies are designed just
before their feature is implemented; this document does not invent those
decisions.

## Product and delivery scope

TownHawll combines entertainment discovery, ratings/reviews, personal libraries,
collections, and selected title intelligence in one product.

- **Games:** `/games`, with canonical title pages at `/games/[slug]`.
- **Screen:** movies and shows share `/screen` and `/screen/[slug]`. They remain
  distinct data types; do not create separate top-level movie/show applications.
- Browse, search, profiles, collections, and libraries are shared systems.
- Onboarding preferences change defaults and personalization, not permissions.
- Spoiler protection is the default. Private moderation and account information
  must never appear on public profiles.

| Stage        | Architectural scope                                                                                                                                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP          | Accounts/onboarding, catalogue ingestion and stored title pages, search/Browse, ratings/reviews, libraries, collections, profiles, reporting/blocking, core admin/moderation, selected precomputed enrichment, basic CI and operational reliability. |
| Public Beta  | Harden MVP; add basic Steam sync, initial XP ledger/safeguards, starter achievements, one leaderboard, useful notifications, release calendar, Profile Health/appeals, and production operations.                                                    |
| Later phases | Full assistant/RAG/tools, semantic search and advanced recommendations, Squad Finder, mature progression/reputation, Plus and affiliate/price systems. Awards remain deferred beyond Beta unless explicitly pulled forward.                          |

The broad V1 page maps describe eventual destinations, not MVP requirements. See
[product scope][scope] and the [public page map][pages].

## System overview

```text
Browser
  |
  +--> apps/web: public and authenticated Next.js application
  +--> apps/admin: staff Next.js application
           |
           v
    Validate input and authorize operation
           |
           v
    Shared server-side domain services
      |          |            |                |
      v          v            v                v
 Repositories  Adapters   Temporary state    Job dispatch
      |          |            |                |
 PostgreSQL   Providers      Redis       Cloudflare Queues
                                               |
                                     apps/workers consumers
                                               |
                                     Shared domain services

Cloudflare Cron --> scheduled handlers --> bounded background work
Storage adapter --> R2 file bytes; PostgreSQL stores metadata/references
All server runtimes --> shared observability helpers
```

This is a pnpm + Turborepo monorepo with separate application/runtime boundaries
and shared business logic. It is not a microservices system. There is no
separate Express backend in the baseline.

Normal server flow:

```text
UI / Route Handler / Server Action
  -> validation
  -> authorization
  -> domain service
  -> repository or provider adapter
  -> PostgreSQL or external service
```

See [locked architecture decisions][hld].

## Application and package boundaries

| Boundary                | Responsibility                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`              | Public and authenticated rendering, routing, sessions, request handling, and user-facing orchestration.                                 |
| `apps/admin`            | Staff UI for catalogue/imports, moderation, users, AI verification, jobs, audit views, and operations. Reuses the same domain services. |
| `apps/workers`          | Cloudflare queue consumers, cron handlers, and background orchestration. Reuses shared business rules.                                  |
| Domain packages         | Reusable business behavior, feature invariants, and explicit service interfaces.                                                        |
| Infrastructure packages | Database access, provider adapters, queue/storage/email/cache integration, configuration, and telemetry.                                |
| UI/config packages      | Shared presentation primitives and build/lint/type configuration.                                                                       |

Keep pages, components, handlers, and Server Actions thin. Do not duplicate
rules between public, admin, and worker runtimes. Modules communicate through
explicit services rather than reaching into unrelated module internals.

Server-only dependencies and privileged data must not enter browser bundles.
Browser code cannot directly access PostgreSQL, Redis, privileged R2 operations,
provider secrets, or AI provider APIs. Public media delivery through the CDN is
separate from privileged storage access.

### Target repository organization

```text
apps/
  web/                   # Public Next.js app
  admin/                 # Staff Next.js app, when implemented
  workers/               # Background runtime, when needed
packages/
  database/              # Prisma schema, migrations, database boundary
  auth/                  # Shared authentication/authorization support
  ui/                    # Reusable UI primitives
  config/                # Validated shared configuration
  validators/            # Shared input/data contracts
  content/               # Catalogue and publishing services
  reviews/               # Review domain behavior
  collections/           # Collection domain behavior
  moderation/            # Moderation domain behavior
  integrations/          # External provider adapters
  search/                # Search services
  ai/                    # AI orchestration and enrichment
  cache/                 # Temporary Redis infrastructure
  queue/                 # Queue integration and shared contracts
  storage/               # Object-storage adapter
  email/                 # Email adapter and delivery support
  notifications/         # Notification domain, when shipped
  gamification/          # XP/achievements, when shipped
  observability/         # Logger, context, redaction, Sentry helpers
  typescript-config/
  eslint-config/
tooling/                 # Operational/development scripts
docs/engineering/        # Repository engineering references
.github/                 # CI and repository automation
```

Add concrete packages when needed; do not pre-create the entire tree. Existing
package names and exports must be inspected before introducing naming changes.
The detailed Notion tree is a target organizational guide, not an exact route
specification. Use the page maps for destination semantics.

The repository currently contains apps/web, apps/admin, packages/db,
packages/config, and the shared TypeScript and ESLint configuration packages.
Worker and product-domain packages remain deferred until their implementation
steps need them.

See [locked monorepo structure][monorepo].

## Rendering, client state, and API design

- Use Next.js App Router, React, and TypeScript with strict typing.
- Use Server Components for initial rendering and SEO-sensitive public pages.
- Use Next.js caching/revalidation for suitable public catalogue/editorial data.
- **TanStack Query** is the selected client server-state library for interactive
  queries and mutations. Do not introduce SWR alongside it.
- Use React state for local UI; use Zustand only for justified complex global
  client-only state, never as the server-state cache.
- Keep important operations reusable beyond browser-specific Server Actions.
  Future mobile-accessible features need stable JSON API contracts, pagination,
  authentication planning, and deep-link-compatible routes.
- Use Tailwind, design tokens/CSS variables, and shadcn/Radix accessible
  primitives. Build mobile-first with keyboard, focus, labeling, and
  reduced-motion support.
- The PWA direction is online-first. Do not introduce offline mutation replay or
  service-worker caching of private/authenticated responses as a baseline.

Define pagination, cache ownership, invalidation, loading, empty, and failure
states for each implemented feature. Avoid unbounded lists and N+1 queries. See
[engineering concepts and client-state decisions][engineering].

## Canonical data model

`Title` is the canonical identity for games, movies, and shows. Its type is
`GAME`, `MOVIE`, or `SHOW`; only genuinely shared metadata belongs on it.

| Data group    | Conceptual entities and boundaries                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Identity      | User, Profile, auth accounts/sessions, preferences, blocks.                                                                 |
| Catalogue     | Title, type-specific extensions, Season, Person, Company, Genre, Franchise, Platform, Release, ProviderMapping, MediaAsset. |
| User content  | LibraryEntry, Collection, CollectionItem, Rating, Review, reactions, reports.                                               |
| Operations    | Import state, overrides, moderation actions, audit records; restrictions/appeals and notifications as shipped.              |
| Later systems | Steam sync state, XP events/balances, achievements, squads, AI conversations and feature-specific persistent records.       |

This is a conceptual inventory, not a complete Prisma model list or physical
ERD.

- Game-specific platforms, requirements, modes, company roles, DLC/editions, and
  platform releases live outside the shared Title model.
- Screen-specific cast/crew, runtime, certifications, networks, watch providers,
  and production data stay in appropriate extensions/relations. Shows own season
  structure; episode-level modeling remains a feature decision.
- Reviews, ratings, collections, libraries, and enrichment generally reference
  the TownHawll Title ID rather than provider-specific records.
- ProviderMapping relates an internal entity to provider, provider entity type
  where needed, and external ID. One title may map to IGDB and Steam.
- Internal generated IDs survive provider, mapping, and slug changes. Choose one
  consistent strategy during bootstrap; CUID2 versus UUIDv7 is not locked here.
- Enforce important uniqueness/integrity in PostgreSQL, including one review per
  user/title and appropriate provider-mapping/idempotency constraints.
- Collections support Public, Private, and Unlisted visibility. Collection item
  changes do not implicitly modify Library state or delete catalogue titles.

See [core data architecture][data], [content/provider boundary][boundary], and
[collection workflow][collections].

## Persistence and ownership

**Supabase PostgreSQL in Mumbai (`ap-south-1`) is the permanent source of
truth.** Use it as managed PostgreSQL through server-side Prisma/database
boundaries.

- Use one logical Prisma schema, split into domain-oriented files as it grows.
  Cross-file relations are expected; do not create one file per table.
- Schema changes require migration files under version control. Production
  changes use a reviewed migration workflow, never `prisma db push`.
- Use `createdAt`/`updatedAt` for mutable persistent entities. Add `deletedAt`
  and actor fields only where restoration, history, or administrative value
  needs them.
- Prefer structured relational data. JSON is appropriate for deliberately
  flexible metadata, versioned AI output, or retained provider snapshots.
- Use transactions for coupled state changes and required audit writes. Use
  durable event/outbox records when important follow-up delivery must survive a
  failure between committing state and dispatching work.
- Upstash Redis holds temporary rate limits, quotas, locks, deduplication
  markers, counters, and short-lived caches. TTL/invalidation are defined per
  use case. If deleting Redis loses important permanent state, that state
  belongs in PostgreSQL.
- R2 stores permitted media, uploads, and generated files. PostgreSQL stores
  object keys, ownership, provenance, dimensions/status, and relationships. Do
  not store large binaries/Base64 media in database rows. Derive delivery URLs
  from references.

TownHawll owns user contributions, editorial decisions, internal identity, and
moderation state. Provider-sourced data retains its provenance after
normalization. Important AI-derived values retain model/source/version and
review information. Provider refreshes must preserve approved overrides; AI
enrichment must not make the original source unrecoverable. Add provenance where
it enables safe refresh, review, attribution, or debugging rather than on every
trivial field.

See [persistence conventions][persistence] and [data ownership][provenance].

## Providers, ingestion, and media

| Provider      | Purpose                                                             |
| ------------- | ------------------------------------------------------------------- |
| TMDB          | Movies, shows, seasons, people, media, watch-provider metadata.     |
| IGDB / Twitch | Games, platforms, companies, franchises, artwork, releases.         |
| Steam Web API | Authorized ownership/playtime/profile sync when that feature ships. |
| Resend        | Transactional authentication/security/moderation email.             |
| Cloudflare R2 | Permitted object/media storage through an adapter.                  |

```text
Provider -> adapter -> validate -> normalize -> TownHawll schema -> PostgreSQL
Admin import: search -> preview -> normalize/validate -> duplicate check
              -> store/edit -> publish
Public catalogue/search: read stored TownHawll data
```

Keep provider response types and credentials inside integration code. Validate
untrusted input and provider responses with Zod/the established validation
layer. Define provider-specific rate limits, batching, retry
classification/backoff, deduplication, monitoring, and degraded behavior before
shipping an integration. Provider outages must not break ordinary stored
catalogue pages.

Before ingestion, confirm current terms, attribution, permitted retention,
commercial use, and image/watch-provider handling. Do not assume permission to
mirror an image merely because its URL is available.

The selected media baseline stores two poster sizes (card and
high-quality/master) and one optimized size for other media. TownHawll generates
stored variants during ingestion/upload and serves them through
`media.townhawll.com` and Cloudflare CDN. Paid Cloudflare Images transformations
are not the selected baseline. Exact processing runtime, format/size limits,
replacement, and lifecycle policies remain implementation decisions; references
to Sharp are examples, not a locked runtime.

See [provider/infrastructure plan][infra]. Do not treat its cost estimates as
fixed quotas or as an MVP requirement to ingest a specific catalogue size.

## Authentication and authorization

Auth.js is the selected framework for email/password and Google OAuth. Support
email verification, password reset, secure cookie sessions, normal logout, and
logout from all sessions. Phone-number/OTP authentication is outside V1.

Visitors are public readers. Verified users can contribute subject to
eligibility, limits, and restrictions. Staff are verified users with one or more
staff roles. Unverified/restricted/suspended/banned/deleted are account states,
not roles. Subscriptions are entitlements and must remain separate from
authorization.

| Role            | Responsibility                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------ |
| CONTENT_EDITOR  | Catalogue create/update/publish, editorial management, permitted AI verification.                |
| MODERATOR       | Reports, moderation, restrictions, bans, appeals within allowed scope.                           |
| ADMIN           | Daily product operations, content/AI overrides, user operations and permitted XP/job controls.   |
| TECHNICAL_ADMIN | Jobs, integrations, observability, technical AI operations, approved local scoped kill switches. |
| OWNER           | All permissions, staff-role assignment/removal, global/critical controls and emergency lockdown. |

Roles are separate responsibilities, not a hierarchy. Effective permissions are
their union; OWNER grants all. The role descriptions do not replace the detailed
[permission matrix][permissions].

Every protected server operation checks authentication, email/account state,
required permission, resource ownership/scope, and feature-specific rules.
Centralized helpers such as `requireVerifiedUser`, `requirePermission`, and
`requireOwnership` are the intended pattern. Middleware and hidden controls are
only preliminary guards/UX. Unauthorized admin route access returns 403.

Hash passwords securely. Verification/reset tokens are single-use, expiring, and
excluded from logs. Account linking must safely handle existing credentials and
Google users. Finalize session rotation/revocation, password rules, token
expiry, Google verified-email trust, CSRF/origin checks, and endpoint-specific
abuse limits before auth implementation. Old universal numeric auth limits are
not authoritative.

See [roles][roles], [current auth direction][auth], and [auth
workflow][auth-flow].

## Audit, telemetry, and operational controls

### Durable audit history

Meaningful staff actions require append-only audit records: actor/effective
roles, action, target, timestamp, result, reason where required, safe
before/after diff, and request context. Staff cannot edit/delete this history.
Sensitive actions must not complete without their required audit entry.
Dangerous operations require stronger checks, explicit confirmation, and a
reason as specified by the feature.

Audit history is PostgreSQL business/security state, not disposable platform
logs.

### Runtime observability

Use `packages/observability` for structured logging, context, redaction, and
shared Sentry helpers across web/admin/workers. Typical context includes event,
level, service, environment, requestId, jobId, safe actor/entity IDs, provider,
duration, and release/version. Exclude credentials, tokens, private raw
payloads, and sensitive moderation data.

```text
MVP: shared logger -> structured console output -> Vercel platform logs
Beta target: same logger -> Cloudflare logs/managed export -> Better Stack
Sentry: errors, stack traces, releases, and sampled performance tracing
```

Domain code must not call log transports directly. Telemetry delivery is
non-blocking and must not delay user operations. Add health checks, correlation,
provider/job failure visibility, and actionable alerts as features arrive. Beta
adds centralized logs, queue/slow-query/provider monitoring, cost alerts,
restore tests, and incident/rollback procedures. Advanced distributed tracing is
deferred until justified; Langfuse is optional for the later AI phase.

### Flags and safety controls

The external Feature Flag + Controlled Rollout service owns flag
creation/editing, environments, audience targeting, percentages, rollout
configuration, keys, and its audit history. TownHawll consumes its SDK/API;
admin flag/rollout surfaces are read-only integration views/deep links.

Critical TownHawll kill switches remain local so they work during a flag-service
outage. Technical admins receive approved scoped controls; OWNER retains global,
security-critical, cost-critical, and emergency controls. Exact scope checks
must be defined per action, not inferred from a broad permission name.

See [architecture decisions][hld], [permission integration][permissions], and
[admin page map][admin-pages].

## Background processing

Cloudflare Queues provides delivery, Workers execute consumers, and Cron
Triggers schedule work. Slow/retryable imports, refreshes, syncs, enrichment,
notifications, exports, and later XP processing use shared domain services from
these runtimes.

- Messages are transport, never the sole copy of important job/business state.
- Pass stable IDs/versions rather than large database objects.
- Define idempotency, retry classification/backoff, timeout, concurrency, batch
  size, and terminal/dead-letter behavior separately for each workload.
- Duplicate delivery must not duplicate permanent effects.
- Cron dispatches bounded due work; avoid unlimited full-table scans/processing.
- Track attempts, delay, duration, errors, and final state; add safe admin
  inspection/retry when required by operations.

Introduce the foundation with the first real workload that needs it. The build
order's later job milestone does not authorize unsafe synchronous imports
earlier.

## AI architecture

MVP AI is selected **precomputed title enrichment**, with schema validation,
provenance, confidence/evidence, version information, and admin
review/overrides. Reuse stored intelligence; do not regenerate it on every
title-page request.

The later assistant/tool architecture is TypeScript-first and
provider-independent:

- SQL/rules for exact facts and deterministic actions.
- PostgreSQL full-text/trigram search for lexical retrieval; pgvector when a
  shipped feature actually requires embeddings.
- RAG for grounded source-backed answers; hosted models for
  reasoning/generation.
- Typed validated tools and response blocks; dedicated tools and assistant entry
  points share contracts, business logic, and result components.
- HTTP `ReadableStream`/SSE-style events for text, tool status/results,
  citations, completion, and errors. WebSockets are not required for ordinary AI
  chat.
- Model/provider, stored-result, and non-AI fallbacks with bounded token,
  tool-call, request, and cost limits. User-visible credits do not replace
  internal budgets.
- Choose models through TownHawll evaluations for citations, spoiler safety,
  structured output, tools, quality, latency, and cost. Prices and example
  credit allowances are planning snapshots, not locked application
  configuration.

AI tools use normal server authorization and may perform safe account actions
only after explicit user request. Bulk/removal/replacement/privacy/destructive
actions require confirmation. AI must not alter auth, payments, roles,
XP/reputation, moderation, Steam connections, or accounts, publish opinions,
vote/report users, or perform admin actions. Uncertain AI must not automatically
issue permanent bans.

No production Python AI service or dedicated GPU infrastructure is in the
initial baseline. Python experiments/evals are allowed; a service requires a
concrete Python-native inference/ML workload. No separate vector database
without measured need. See [AI planning][ai] and [AI technology
reference][ai-tech].

## Environments, deployment, and verification

| Environment         | Purpose                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Local               | Engineering sandbox; the current build order includes local PostgreSQL/Redis, Prisma, migrations, seeds, and environment validation. |
| Preview/private MVP | Validate changes with eligible Vercel hosting for web/admin and isolated configuration.                                              |
| Staging             | Production-like verification of integrations, migrations, auth, jobs, and runtime compatibility.                                     |
| Production/Beta     | Controlled releases, durable catalogue/user state, operational monitoring and tested recovery.                                       |

Cloudflare DNS/security, R2, Queues, and Workers/Cron remain independent of the
Next.js hosting choice. Move web/admin to Workers Paid only after representative
OpenNext builds pass runtime, bundle-size, middleware, Server Action,
secret/env, Prisma/database, and observability checks. Track compressed bundle
size in CI and verify platform limits before deployment. If compatibility fails
real needs, reconsider hosting rather than inventing arbitrary multi-Worker
splits.

Keep deployment providers out of domain logic. Validate environment
configuration, scope secrets by runtime/environment, and document required
variables in safe examples. Never commit credentials or use production private
data as test fixtures.

Use committed migrations and backward-compatible expand/migrate/contract changes
for risky updates. Test restoration and application rollback without assuming
database migrations can simply be reversed. Production ingestion starts only
once local/staging imports are proven safe and production work is explicitly
authorized.

GitHub Actions runs the repository format, lint, typecheck, and build scripts.
There is no test script yet. The build order also calls for protected main,
secret scanning/push protection, Dependabot, and CodeQL. Do not claim those
controls exist solely because they are planned. Add OpenNext and test checks
when the corresponding targets exist.

Use risk-based unit tests for domain rules, integration tests for repositories,
authorization/adapters/jobs, and E2E tests for critical user/admin flows. Tests,
audit requirements, and retry safety accompany the feature that needs them;
final hardening milestones broaden coverage rather than postponing basic
correctness.

See [pre-coding phase gates][checklist] and [MVP build order][build-order].

## Implementation sequence and unresolved decisions

The current sequence is foundations (bootstrap, local infrastructure, CI, auth,
observability, users/admin permissions), catalogue schema/adapters/import,
stored public catalogue/search/discovery,
libraries/ratings/reviews/collections/profiles, selected
enrichment/verification, moderation, and stabilization. Once imports are
reliable, permanent catalogue ingestion continues alongside later product work.
Use the linked build order for the full 28-step sequence.

The following must not be silently converted into implementation assumptions:

| Topic                | Treatment                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema details       | ID algorithm, indexes, enums, cascades, episode/DLC structures, retention, and exact provider mappings are phase decisions.                                                                 |
| Auth security        | Session/token lifetimes, revocation, account linking/trust rules, and numeric abuse limits need feature design.                                                                             |
| Media                | Follow the explicit self-generated R2 variant baseline. Older paid-transform budgets and conflicting storage estimates remain stale planning text.                                          |
| AI/Plus              | Exact models, allowances, pricing, benefits, and shipped tools are not final. The V1 tool list also overlaps its deferred list; MVP/Beta deferral is clear.                                 |
| Permissions          | Use external flag ownership and scoped local controls. Extend the core permission matrix with exact action/resource scopes before implementation.                                           |
| Build milestones     | Audit/jobs/tests listed late do not supersede the correctness/security requirements of earlier operations. Local Redis setup does not justify permanent Redis state or speculative caching. |
| Historical checklist | The Full Project Checklist is a historical reference, not a completion tracker; use the current Pre-Coding Checklist.                                                                       |

Update this reference when an approved decision changes. Keep detailed feature
designs and operational runbooks separate, and link them as they are introduced.

## Source documents

- [Locked Monorepo Architecture & Folder Structure][monorepo]
- [High-Level System Design: Architecture Decisions][hld]
- [Core Data Architecture][data]
- [Content Model & Provider Boundary][boundary]
- [Data Ownership & Provenance][provenance]
- [Persistence Conventions][persistence]
- [Users, Roles & Permissions][roles]
- [Admin Permissions & Feature Flag Integration][permissions]
- [External Providers & Infrastructure Cost Plan][infra]
- [Things to Know Before][engineering]
- [Pre-Coding Checklist][checklist]
- [MVP Build Order][build-order]
- [All Public & Admin Features: MVP, Public Beta, and V1][scope]
- [Public Page Map][pages] and [Admin Page Map][admin-pages]
- [Auth feature direction][auth] and [Auth workflow][auth-flow]
- [Collection Management Workflow][collections]
- [AI Models, Usage Limits & Cost Estimates][ai]
- [AI Tech Stack & Concepts to Learn][ai-tech]

[monorepo]: https://www.notion.so/3a470306b84281be9881d1ffc68abc91
[hld]: https://www.notion.so/3ba70306b84281b58064f1a838225533
[data]: https://www.notion.so/3ca70306b8428161a13fd6a98fb2c3af
[boundary]: https://www.notion.so/3ca70306b84281d08b58e625128ef05d
[provenance]: https://www.notion.so/3ca70306b84281c78235d0c928e646e7
[persistence]: https://www.notion.so/3ca70306b8428151abe0c4ea35b2d9d7
[roles]: https://www.notion.so/3af70306b84281d4a814d097d81ddc25
[permissions]: https://www.notion.so/3c970306b842818bbafad7d4ab5b685a
[infra]: https://www.notion.so/3a570306b842817fa4bbc133109f7ffa
[engineering]: https://www.notion.so/3a770306b842814cb08bc4527bfce111
[checklist]: https://www.notion.so/3a570306b84281fc894ed2c4730d4edc
[build-order]: https://www.notion.so/3d370306b8428106a268eb9c8b2237ef
[scope]: https://www.notion.so/39f70306b84281a79c89c0639a9ca9f3
[pages]: https://www.notion.so/3af70306b84281dca8a1e5759fa51d0e
[admin-pages]: https://www.notion.so/3af70306b84281e8b3e0d57e936ff8da
[auth]: https://www.notion.so/38b70306b8428034bb8dc469ef0a680b
[auth-flow]: https://www.notion.so/3b470306b84281af9d49f8c4b7fe7937
[collections]: https://www.notion.so/3b470306b8428150818eebb127044b79
[ai]: https://www.notion.so/3a570306b84281efb361f13da9859f96
[ai-tech]: https://www.notion.so/3b670306b842817d85fcfee461eef8a0
