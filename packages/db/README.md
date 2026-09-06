# @townhawll/db

Owns the Prisma schema, migrations, generated client, and shared database
client.

The schema is intentionally model-free during local infrastructure bootstrap.
Domain models belong to the MVP steps that define their rules and ownership.
