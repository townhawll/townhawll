# @townhawll/storage

Server-only object-storage adapters for TownHawll. Application and domain code
use the typed storage contract rather than provider SDK responses.

- `local` persists development objects in the ignored `.tmp/storage/` directory.
- `r2` uses Cloudflare R2 through its S3-compatible API.

Use `createMediaObjectKey({ category, extension })` for public media. It creates
`<category>/<random-uuid>.<extension>` keys for `titles`, `seasons`, `people`,
`users` and `collections`, without a `media/` prefix or embedded owner ID. The
extension must match the stored bytes. PostgreSQL defines ownership and purpose.

Uploads create new objects only: R2 uses `If-None-Match: *`, and local storage
uses exclusive file creation. Replacements receive fresh keys. Store object keys
in PostgreSQL; adapters use `buildPublicObjectUrl` to construct delivery URLs
from the configured base. Production R2 delivery requires HTTPS.

This is **public storage**, not a private-upload API. UUIDs and prefixes do not
provide authorization. Private files need a separate protected bucket/access
path. The local delivery route serves only recognized public-media prefixes.

## Profile avatars

`@townhawll/profile/avatar` owns avatar authorization-independent domain logic;
the web Route Handler resolves the verified session, enforces same-origin
requests and applies user/IP rate limits. Client-supplied user IDs are ignored.

Avatar uploads accept JPEG, PNG or WebP, up to 5 MiB and 16 megapixels. The
avatar-specific Sharp helper fully decodes, rejects animation/corruption,
corrects orientation and writes a metadata-stripped WebP within 512 × 512,
preserving aspect ratio without upscaling. It is not the catalogue processor.

`Profile.avatarObjectKey` is authoritative for managed avatars. `avatarUrl`
remains available for external OAuth avatars and legacy URL-only references; new
managed uploads do not persist a duplicated CDN URL. Public profile, onboarding
and editing reads resolve managed URLs through the storage adapter.

Replacement uploads first, conditionally updates the profile against its prior
avatar reference, then deletes the prior owned managed object. A conflict only
cleans the unused new object. An uncertain database commit never triggers
deletion of a potentially active upload. Failed cleanup/uncertain outcomes can
leave orphans for later reference-aware reconciliation. External OAuth URLs and
unrelated object keys are never deleted. An existing external fallback is
preserved when a managed avatar is removed.

## Legacy compatibility and migration

Existing `users/<userId>/avatar/<uuid>.<ext>` keys and URL-only avatars remain
readable. Do not rename objects or rewrite database rows merely to flatten the
path. New uploads adopt `users/<uuid>.webp`; old references retire naturally on
replacement/removal. Changing the public base URL requires no managed-key
update.

If an explicit backfill is later required: inventory bounded database
references, verify each source object, create and verify a fresh correctly
encoded object, conditionally switch the database reference, and only then
consider deleting an unreferenced old object. Keep checkpoints and reconcile
partial failures. A missing object needs restoration/re-upload, not an automatic
key rewrite. No backfill or production storage mutation is performed by these
helpers.

Catalogue assets/versions/variants, provider downloads, upload verification,
30-day rollback retention and scheduled cleanup belong to the catalogue media
pipeline. They are not added to the avatar schema.
