# Catalogue integrations

Server-side provider adapters belong here. The package provides TMDB, IGDB and
Steam adapters, transport, identities and normalized review-candidate contracts.
It makes no provider calls at import time and has no Prisma or Next.js runtime
dependency.

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

## TMDB

Import the server-only entry point and reuse the adapter per credential scope:

```ts
import { createTmdbAdapter } from "@townhawll/integrations/tmdb";

const tmdb = createTmdbAdapter(); // Reads validated TMDB_ACCESS_TOKEN.
const matches = await tmdb.searchMovies({ query: "King Kong", page: 1 });
const movie = await tmdb.getMovie("254");
const series = await tmdb.getSeries("30991");
const person = await tmdb.getPerson("3489");
```

`searchSeries` supports pagination, language, adult filtering, year and
first-air year. Movie search also supports region and primary release year. IDs
must be canonical positive decimal strings within TMDB's documented integer
range.

Title details use one [appended request][append] for credits, keywords, aliases,
images, videos, certifications and regional watch availability. Series also use
aggregate credits, preserving distinct characters/jobs and creators. Related
people, companies, networks, collection and season references have qualified
provider identities. Nothing is persisted or published.

People are references by default. Request `peopleLimit: 1` through `10` for
bounded detail enrichment, or call `getPerson` explicitly. All requests share
the HTTP client's concurrency/rate limits; one title operation has a 60-second
deadline. There is no per-season, collection-member or episode request fan-out.
A failed supplement leaves the title usable and adds a safe `issues` entry.
Missing and invalid appended sections are diagnosed separately from known empty
arrays.

`titleDetailsCandidateSchema` defines the public envelope: core `title`, genres,
keywords, credits, people, companies, franchises, seasons and watch providers.
Provider schemas and pure normalization remain inside `src/providers/tmdb`. The
envelope also retains source status, spoken-language codes, episode-runtime
values and provider popularity for later review. Video metadata and image paths,
dimensions, provider language, primary flags and vote signals remain candidates.
No candidate is ranked, accepted, downloaded or activated.

Calendar dates stay date-only. New/unknown statuses remain `UNKNOWN`, with the
original status preserved. Series runtime is the rounded mean of positive
`episode_run_time` values; multiple values are explicitly marked inferred.
Spoken languages do not prove dubbed releases; dubbing and verified video audio
stay unknown. Certification values, countries and release-event context are
preserved; TMDB does not normally identify an authority system, so it remains
null rather than being guessed from country alone. Effective certification/age
selection and anime classification remain separate normalization policies.

Detail language is optional. Supplying a language can filter TMDB images/videos;
use `imageLanguages`, such as `["en", "ja", "null"]`, to expand image coverage.
There is no automatic multilingual video fan-out or independent video
validation. Company/network logos remain source references, not catalogue-owned
media assets.

Watch availability preserves region, access mode and TMDB's provided watch URL;
it does not fabricate service deep links. Displaying this data requires
[JustWatch attribution][watch].

[append]: https://developer.themoviedb.org/docs/append-to-response
[watch]: https://developer.themoviedb.org/reference/movie-watch-providers

## IGDB and Twitch

```ts
import { createIgdbAdapter } from "@townhawll/integrations/igdb";

const igdb = createIgdbAdapter(); // Validated IGDB_CLIENT_ID / IGDB_CLIENT_SECRET.
const matches = await igdb.searchGames({ query: "Hollow Knight", limit: 20 });
const game = await igdb.getGame("14593"); // null when the ID is absent.
```

Reuse one adapter per credential scope and process. Twitch application tokens
are cached in memory, refreshed before expiry, and obtained through one shared
in-flight request. Secrets stay in the token request's form body. A rejected
IGDB token gets one recovery attempt; late failures cannot evict a newer token.
Cancelling a caller does not cancel a token refresh needed by other callers.
Token minting is not automatically replayed after an ambiguous network failure.

The shared transport handles read-only POST retries, Retry-After, response-size
limits and cancellation. IGDB configuration cannot exceed its documented four
starts per second or eight simultaneous requests; defaults use two simultaneous
requests. The limits are process-local: multiple instances must eventually
coordinate the provider quota. Each search/detail operation has a 60-second
deadline including token waits and supplementary requests.

Search uses `limit` (1–50), `offset` (0–10,000), optional `platformIds` and
`gameTypeIds`. Filters accept validated decimal IDs, including the zero-valued
main-game type. One look-ahead result determines `nextOffset`; totals are not
invented and no count request is made. Search text containing query delimiters
(`"`, `\`, `;`) or control characters is rejected rather than interpolated into
APICALYPSE. Trusted field lists and endpoints are internal to the adapter.

Detail fetching uses one expanded game query plus one completion-time query. Use
`includeCompletionTime: false` to omit the latter. No per-platform, company,
franchise or related-game requests are made. A failed completion supplement
preserves the candidate and reports a safe `issues` entry through the shared
logger. Core authentication/response failures remain typed provider errors.

`gameDetailsCandidateSchema` extends the common detail envelope. `game` retains
themes, source type/status/mode evidence, platform release events,
relationships, rating authorities, completion times and confirmed Steam
references. Unexpanded named references remain available in
`unresolvedReferences`; they do not create placeholder catalogue records.
Provider DTOs are private to `src/providers/igdb`.

- Release events retain their region, format, label and timestamp. The primary
  release uses precision evidence matching IGDB's first-release timestamp; an
  unqualified timestamp does not become an invented exact day. Year, quarter and
  month precision remain intact. Unknown explicit statuses stay `UNKNOWN`;
  date-based status inference is separately marked with evidence.
- Modern expanded type/status/rating tables are used rather than deprecated enum
  fields. Unknown types become `OTHER` with their original value retained.
  Primary audio language is unsupported; interface/localization support is not
  treated as proof of original audio.
- Typed DLC/expansion/remake/remaster/edition links run child → parent. Other
  explicit relationships remain `RELATED`. Source fields and qualified IDs are
  retained even if the related title has never been imported. Similar games,
  names and collection ordering do not establish sequel/prequel relationships.
- Certifications preserve authority-specific labels. Unsupported boards/labels
  remain raw evidence with no fabricated normalized certification. Country is
  unknown where the rating record does not provide it; a regional board is not
  evidence of a particular country release. Effective age/certification policy
  remains separate.
- Completion values retain seconds, submission count and update time. IGDB's
  documented definitions support main-story (`hastily`), main-plus-extra
  (`normally`) and completionist (`completely`) values. Conversion to rounded
  minutes is marked inferred; zero/absent durations stay missing. Multiplayer
  modes do not suppress otherwise available completion data.
- Steam identities require an explicit `Steam` external source and valid app ID.
  An unambiguous reference may join title mappings. Multiple conflicting IDs
  remain evidence for review. No Steam request, fuzzy matching or claimed Steam
  update timestamp is introduced.
- Covers retain their poster purpose. Artwork and screenshots retain distinct
  source types with `purpose: null` until selection assigns a purpose. This is a
  candidate-only extension, not a database media enum change. Image IDs, numeric
  record IDs, dimensions and original CDN references are preserved. Videos
  retain YouTube keys, record IDs and names; authenticity, type and audio
  language remain unknown without evidence. No ranking, media fetching or
  activation happens here.

The implementation follows the [IGDB API reference](https://api-docs.igdb.com/)
and
[Twitch client-credentials flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow).
IGDB/Twitch uses the existing environment variables and needs no schema changes.

## Steam supplementary metadata

```ts
import { createSteamAdapter } from "@townhawll/integrations/steam";

const steam = createSteamAdapter();
const result = await steam.enrichGame(igdbCandidate);
// result.candidate retains the original IGDB data.
// result.supplementary is known or explicitly missing; result.issues is safe metadata.

// Alternatively, supply an app identity from an explicitly trusted stored mapping:
const supplement = await steam.getAppDetails({
  provider: "STEAM",
  entity: "app",
  id: confirmedSteamAppId,
});
```

There is no name search or automatic matching. `enrichGame` selects an exact
Steam mapping or confirmed IGDB reference. Conflicting identities are left
unresolved; an optional `identity` may select only one already present in that
game's evidence. Direct `getAppDetails` callers must obtain identities from a
trusted server-side source. Shape validation does not make browser-provided
claims trustworthy or replace the future import operation's authorization.

The server-only `/steam` entry point uses the shared HTTP client and Store
`appdetails` JSON endpoint. No Steam API key, login, cookies, scraping or Web
API call is needed. The Store endpoint does not provide a versioned response
guarantee; runtime validation and bounded partial failures are essential.
English is requested for requirement labels; `countryCode` defaults to `US` and
is preserved in the supplement. No automatic country fallback is performed.

One app is requested at a time with `basic,platforms` filters. Live verification
confirmed that `basic` includes identity/type and requirement blocks; individual
requirement-field filters do not return those fields. Unrelated descriptions and
media in the response are discarded. The response key and `steam_appid` must
both match exactly. `success: false` returns null; it cannot reliably
distinguish unknown, removed or region-unavailable apps. Other HTTP/response
failures are typed errors. `enrichGame` converts expected provider failures into
a missing supplement while retaining the original candidate. Explicit
cancellation still propagates. App type is separately normalized to
GAME/DLC/DEMO/OTHER with its original value retained; it never replaces IGDB's
game type or title metadata.

Local defaults are one concurrent request, one start per second, 20 queued
requests, three attempts, a 10-second attempt timeout, a 30-second total
deadline and a 1 MiB response cap. These are conservative application limits,
not a claim about Steam's published quota. Reuse the adapter per process; limits
are not distributed. Overrides cannot increase rate/concurrency/attempts and
have bounded timeouts. Retries and Retry-After reuse the shared transport.

`game-supplements.ts` owns provider-independent supplementary/requirement
contracts. Steam DTOs stay in `src/providers/steam/schemas.ts`; HTTP,
normalization, text parsing and orchestration are separate modules.

- Windows/macOS/Linux flags preserve true, false and unknown independently.
  Requirement blocks may be objects, empty arrays or missing. Existing text is
  retained even if the current platform flag is false; it may be legacy data.
- MINIMUM and RECOMMENDED are parsed independently for each platform. Invalid
  blocks/tiers add safe issues without discarding other valid rows.
- `htmlparser2` extracts plain text and decodes entities without executing HTML
  or fetching resources. Script/style, `hidden` and `aria-hidden` content is
  excluded. `rawText` is readable text; `originalText` preserves the exact
  source fragment as evidence. Neither is trusted HTML for rendering. Escape
  text normally; never inject the original fragment into a page. Fragments are
  capped at 65,536 characters.
- OS, CPU, GPU, DirectX and notes come from recognizable labeled fields. Unknown
  labels and uncertain values remain in notes/readable text. RAM is never
  extracted from GPU memory or storage. Conflicting repeated fields remain null.
- Capacity conversion explicitly uses the conventional binary PC sizing rule:
  MB/MiB stay unchanged, GB/GiB × 1024, TB/TiB × 1024². This is not a claim that
  provider GB labels are strict SI byte measurements. Missing units, ranges,
  alternatives, ambiguous separators, fractional MB and overflowing values stay
  null. Original units and wording are retained for review.
- Requirements carry source and provenance with `fetchedAt`. Steam supplies no
  requirement update timestamp here, so `sourceUpdatedAt` remains null.

Shared policy refinement and editorial acceptance/persistence remain separate;
this adapter does not write Prisma records or merge approved canonical fields.
