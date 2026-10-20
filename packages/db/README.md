# @townhawll/db

Owns the Prisma schema, migrations, generated client, and shared database
client.

Prisma loads `prisma/` as one logical schema. `schema.prisma` contains the
generator and datasource, `auth.prisma` owns accounts/sessions/tokens, and
`users.prisma` owns users/profiles/staff roles and their enums. Cross-file
relations use the same model names. The existing commands load this directory
through `prisma.config.ts`; migrations remain in `prisma/migrations/` and the
generated client remains in `generated/prisma/`.

## Catalogue schema

| File                        | Domain                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalogue.prisma`          | Canonical titles, provider mappings/snapshots, aliases, movie/series/game metadata, seasons, game requirements/completion times, title relationships |
| `catalogue-taxonomy.prisma` | Platforms/releases, genres, keywords, companies, franchises, regional watch availability                                                             |
| `catalogue-people.prisma`   | People, provider mappings, cast/crew/creator credits                                                                                                 |
| `catalogue-awards.prisma`   | Curated industry awards, categories and title nominations/wins                                                                                       |
| `catalogue-media.prisma`    | Selected logical media assets, versions, R2 delivery variants and external video references                                                          |

New entities use the established CUID IDs and snake-case table/column mappings;
the Notion draft's UUID storage is illustrative. Existing auth/user/staff models
and migration history are unchanged. All catalogue enums are exported through
`@townhawll/db`. No provider integrations or application features are included.

### Database integrity and write contracts

`20261008160000_create_catalogue` includes handwritten SQL which must be
preserved in subsequent migrations:

- Media assets require exactly one title, season or person owner. The specified
  `AVATAR`, `COLLECTION_COVER`, and `PROFILE_BANNER` enum values are retained
  but rejected by a CHECK until their owner domains exist. Existing profile
  avatars remain in the existing profile/storage system.
- The current-version relation is a composite FK to a version's ID **and asset
  ID**. A trigger locks the version and requires `READY` before selection;
  selected versions cannot leave `READY` or be deleted. Create an asset without
  a current version, upload all required variants, mark the new version ready,
  then switch the pointer and record activation/replacement timestamps
  transactionally. Upload completeness, variant policy and retention scheduling
  belong to the future media service; the database cannot verify objects exist
  in R2.
- Deferred constraint triggers reject metadata of the wrong title type, seasons
  on non-series titles, and game-only data on non-games. Published titles
  require their corresponding specialized metadata. Draft/hidden/archived titles
  may await hydration. Create/publish a title with its metadata in one
  transaction. Mutations and metadata deletion are checked at transaction
  commit.
- Relationships cannot point to the same title, and source/target/type is
  unique. A partial expression index also rejects reversed duplicates of
  symmetric `RELATED` edges. For directional types, **source is the described
  title**: sequel → earlier title, prequel → later title,
  remake/remaster/edition/reboot/ adaptation → original,
  DLC/expansion/standalone expansion → base title, spin-off → originating title.
  Do not also write the inverse as a second copy of the same relationship.
- Watch availability retains nullable `accessType`. PostgreSQL 15+
  `NULLS NOT DISTINCT` makes duplicate missing-type entries fail too.
- Durations/counts/RAM/storage/display order are nonnegative; known media
  dimensions are positive; byte sizes are nonnegative. Award years are bounded
  to 1800–2200, season 0 supports specials, and person deathday cannot precede
  birthday. Certification countries and watch regions use uppercase two-letter
  codes. Certification selection/age-bucket mapping remains system-aware
  application validation, rather than assuming that MPA R means exactly 18+.

Prisma does not fully represent CHECKs, triggers, expression indexes or NULL
uniqueness semantics. Inspect generated migrations; a schema diff alone cannot
prove these rules survive. Database integration tests exercise them directly.

### Query and ingestion rules for later steps

- Public catalogue queries require `publicationStatus: "PUBLISHED"` **and**
  `deletedAt: null`. Soft deletion retains mappings, media and curated awards;
  restore clears only `deletedAt`. Publication/review state remains independent.
- Hard deletion of titles with award entries, selected media, seasons or
  provider mappings is restricted. Do not cascade away curated history. Clearing
  a current media pointer precedes explicit old-version cleanup; variants
  cascade with their version. Reusable taxonomy entities referenced by titles
  are restricted.
- Provider mapping uniqueness is `provider + providerId`. In Step 9, namespace
  identifiers when a provider has overlapping title ID spaces (for example,
  `provider: "tmdb", providerId: "movie:123"` versus `"series:123"`). Keep raw
  provider identifiers available in snapshots/source references. Provider IDs,
  slugs and snapshots never replace the internal title ID.
- Snapshots need deliberate expiry/retention. Provider popularity remains
  provider-specific. Empty language/mode arrays do not prove confirmed absence.
- Provider refresh must preserve curated awards and manually maintained values.
  Define field ownership during import implementation; no speculative generic
  override/import-job tables are introduced here.
- Existing B-tree indexes cover slug/provider identity, published lists, reverse
  joins, ordered credits and media/cleanup lookups. Alias keys support exact
  matching, not fuzzy contains search. Search GIN/trigram/FTS and representative
  scale benchmarks remain for later search/browse work.

## Verification

Normal schema/client checks:

```bash
pnpm --filter @townhawll/db exec prisma format
pnpm --filter @townhawll/db exec prisma validate
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For **local development**, review the migration and run `pnpm db:migrate`; do
not use `db push` or reset existing data. Check status with
`pnpm --filter @townhawll/db exec prisma migrate status`.

Catalogue integration tests are opt-in and require a local database whose name
ends in `_test`. They roll back every fixture and flush deferred constraints.
Run against a disposable database, never production/staging:

```bash
docker run --name townhawll-catalogue-check --rm -d \
  -p 127.0.0.1:5544:5432 \
  -e POSTGRES_USER=townhawll -e POSTGRES_PASSWORD=townhawll_test \
  -e POSTGRES_DB=townhawll_catalogue_test postgres:18-alpine
# Wait for pg_isready inside the container before applying migrations.
export DATABASE_URL=postgresql://townhawll:townhawll_test@localhost:5544/townhawll_catalogue_test
export TOWNHAWLL_DB_INTEGRATION=1
pnpm --filter @townhawll/db exec prisma migrate deploy
pnpm --filter @townhawll/db exec prisma migrate status
pnpm test
docker stop townhawll-catalogue-check
```

In PowerShell use `$env:DATABASE_URL="..."` and
`$env:TOWNHAWLL_DB_INTEGRATION="1"` instead of `export`. CI creates its own
PostgreSQL test service, applies migrations, and runs Vitest. Production
migration/deployment remains an explicitly authorized later action.
