# @townhawll/db

Owns the Prisma schema, migrations, generated client, and shared database
client.

Prisma loads `prisma/` as one logical schema. `schema.prisma` contains the
generator and datasource, `auth.prisma` owns accounts/sessions/tokens, and
`users.prisma` owns users/profiles/staff roles and their enums. Cross-file
relations use the same model names. The existing commands load this directory
through `prisma.config.ts`; migrations remain in `prisma/migrations/` and the
generated client remains in `generated/prisma/`.

The schema currently contains the minimal identity models required by the auth
foundation. Catalogue and community models belong to their later MVP steps.
