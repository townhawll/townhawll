ALTER TABLE "profiles"
ADD COLUMN "avatar_object_key" TEXT;

UPDATE "profiles" AS profile
SET "avatar_url" = users."image"
FROM "users" AS users
WHERE profile."user_id" = users."id"
  AND profile."avatar_url" IS NULL
  AND users."image" IS NOT NULL;
