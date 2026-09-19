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

## First development owner

After creating and verifying a normal local user account, assign the first
development OWNER with:

    pnpm staff:bootstrap-owner -- owner@example.com

The command is disabled when `NODE_ENV=production`, requires an existing
verified active account, and refuses to run after an OWNER assignment exists.
Additional staff-role changes must go through future authorized staff-management
operations; there is no public staff signup route.

## Object storage

Development uses the local storage driver by default. Uploaded objects are kept
under `.tmp/storage/` and the web app serves them from a development-only route.
The directory is ignored by Git, so no Cloudflare account or storage credentials
are needed to upload an avatar locally.

Production must set `STORAGE_DRIVER=r2` and configure every `R2_*` variable
shown in `.env.example`. `R2_PUBLIC_URL` is the public bucket or custom media
origin. If the driver is omitted during development, complete R2 configuration
selects R2; otherwise TownHawll selects local storage. Partial R2 configuration
fails validation rather than silently using a different driver.

## Checks

    pnpm lint
    pnpm typecheck
    pnpm format:check
    pnpm build

Use pnpm format to format supported repository files.
