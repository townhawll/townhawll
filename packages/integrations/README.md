# Catalogue integrations

Server-side provider adapters belong here. The package currently provides
transport, identities and normalized review-candidate contracts; it makes no
provider calls at import time and has no Prisma or Next.js runtime dependency.

## Boundaries

Provider HTTP → provider-specific Zod response schema → pure normalization →
validated TownHawll candidate. Keep future provider DTOs inside their adapter.
Selection is a separate pure operation. Candidates are not database inputs and
must not be automatically published. Public catalogue pages use stored data.

- Root, `/contracts` and `/identity` exports are pure. `/http` and `/config` are
  server entry points, excluded by the browser export condition. Never import
  these privileged entry points from a client component.
- `/config` reuses `@townhawll/config/server-env`. Credentials are validated
  lazily per provider: `TMDB_ACCESS_TOKEN`, `IGDB_CLIENT_ID` and
  `IGDB_CLIENT_SECRET`, or `STEAM_API_KEY` for authenticated Web API calls.
  Public Steam Store metadata does not require that key. Shared local values
  belong in the root `.env`; examples are in the root `.env.example`.
- Use one long-lived HTTP client per provider/credential scope in each process.
  Defaults: two active requests, 50 queued, four starts/second, 10-second
  attempt timeout, 30-second total deadline and three total attempts. Provider
  adapters must choose suitable limits; these defaults are conservative starting
  values, not claims about provider quotas. Limits are process-local, not a
  distributed quota guarantee. Queueing, backoff and body reading count toward
  the deadline.
- Retry network/timeout failures and HTTP 408/429/500/502/503/504. GET retries
  by default; a known read-only POST query must explicitly opt in with
  `retryable`. Mutations must not opt in without an idempotency guarantee.
  Retry-After is a minimum wait (429/503 also pause that client's dispatch); the
  total deadline takes precedence over waiting indefinitely. Every retry
  consumes capacity.
- Transport accepts a trusted HTTPS base URL and same-origin destinations only;
  redirects are refused. Never derive the base URL from user input. Future
  adapters own fixed provider origins and construct validated paths/parameters.
  The JSON transport is not a secure arbitrary media downloader.
- Successful JSON bodies are capped at 2 MiB by default using both
  Content-Length and streamed bytes, including decompressed bytes. Parsed JSON
  remains `unknown` until `validateProviderResponse` validates it. Invalid
  responses are not retried.
- Errors expose only provider/code/status/retry delay. They exclude URLs,
  credentials, response bodies, raw validation errors and original exceptions.
  Callers can log safe error metadata through `@townhawll/observability`; do not
  add raw request or response logging.

## Identity and contracts

`{ provider: "TMDB", entity: "movie", id: "123" }` and the corresponding
`series` identity are distinct. Decimal string IDs avoid precision loss and
reject leading zeros. `providerMappingKey` returns
`{ provider: "TMDB", providerId: "movie:123" }` for the existing unique
provider/mapping constraints. Apply the same qualification to companies/networks
and franchises/collections. These are external references, never TownHawll IDs.
Matching uses exact mappings, not names. No migration or existing mapping
backfill is performed here.

Contracts use the catalogue's MOVIE/SERIES/GAME vocabulary and keep source
provenance. A field is explicitly known (provided or inferred with evidence) or
missing (not provided, not requested, unavailable, unsupported). Unknown is not
silently converted to false, zero or an empty collection. Dates retain day,
month, quarter or year precision; only exact days can later populate a
PostgreSQL date. Media holds source candidates, not R2 keys/activation state;
HTTPS validation does not replace the later downloader's host/DNS/redirect
protections.

Entity-specific people/company/relationship contracts can be extended alongside
their adapters when their exact requirements are implemented. Transport,
normalization and selection should remain independently testable.

Run `pnpm --filter @townhawll/integrations test`, `lint` or `typecheck`. Like
other source packages, integrations is compiled by consuming applications; it
does not need its own emitted build or custom Turbo task.
