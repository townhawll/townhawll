# @townhawll/storage

Server-only object-storage adapters for TownHawll. Application and domain code
use the typed storage contract rather than provider SDK responses.

- `local` persists development objects in the ignored `.tmp/storage/` directory.
- `r2` uses Cloudflare R2 through its S3-compatible API.

Feature packages choose their own key prefixes and retain authoritative object
references in PostgreSQL. This package owns safe keys, byte validation helpers,
storage operations, and public URL resolution; it does not contain profile or
other product concepts.
