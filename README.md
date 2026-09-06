# TownHawll

TownHawll is an entertainment discovery and community platform for games,
movies, and shows.

The repository currently contains the monorepo and local infrastructure
foundations. Product features are added only when their MVP step needs them.

## Prerequisites

- Node.js 24.11 or newer
- pnpm 11.25.0 through Corepack
- Docker Desktop or Docker Engine with Compose

## Workspace

- apps/web: public and authenticated user-facing Next.js app on port 3000
- apps/admin: staff and operations Next.js app on port 3001
- packages/config: shared server environment validation
- packages/db: Prisma client, schema, and migrations
- packages/typescript-config: shared strict TypeScript configuration
- packages/eslint-config: shared type-aware ESLint configuration

See [docs/engineering/architecture.md](docs/engineering/architecture.md) for the
current system boundaries and implementation rules.

## Local development

Install dependencies and create the local environment file:

    corepack enable
    corepack install
    pnpm install
    Copy-Item .env.example .env

The values in .env.example are development-only defaults. Start PostgreSQL and
Redis, apply migrations, generate Prisma Client, and verify the connection:

    pnpm infra:up
    pnpm db:migrate
    pnpm db:generate
    pnpm db:smoke

Create future development migrations with a concise description:

    pnpm --filter @townhawll/db db:migrate --name concise_change_name

Start both applications:

    pnpm dev

PostgreSQL is permanent application state. Local Redis is intentionally
ephemeral and must only contain temporary caches, locks, limits, quotas, and
idempotency data.

Stop the containers while retaining PostgreSQL data:

    pnpm infra:down

Reset the local database through migrations, or remove all local infrastructure
data and containers:

    pnpm db:reset
    pnpm infra:reset

Both reset commands are destructive and are intended only for local development.
Prisma Studio is available with pnpm db:studio.

## Checks

    pnpm lint
    pnpm typecheck
    pnpm format:check
    pnpm build

Use pnpm format to format supported repository files.
