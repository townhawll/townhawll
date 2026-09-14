# TownHawll

TownHawll is an entertainment discovery and community platform for games,
movies, and shows.

The repository currently contains the monorepo and local infrastructure
foundations. Product features are added only when their MVP step needs them.

## Prerequisites

- Node.js 24.11 or newer
- pnpm 11.25.0
- Docker Desktop or Docker Engine with Compose

## Local development

Install dependencies and create the local environment file:

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
