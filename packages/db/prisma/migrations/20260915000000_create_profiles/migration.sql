-- Keep public usernames in one place while preserving existing accounts.
CREATE TYPE "ContentFocus" AS ENUM ('GAMES', 'SCREEN', 'BOTH');

CREATE TABLE "profiles" (
    "user_id" TEXT NOT NULL,
    "username" CITEXT,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "bio" VARCHAR(500),
    "content_focus" "ContentFocus",
    "onboarding_completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "profiles_username_format" CHECK (
        "username" IS NULL OR "username"::text ~ '^[a-z0-9_]{3,30}$'
    )
);

INSERT INTO "profiles" (
    "user_id", "username", "display_name", "avatar_url", "created_at", "updated_at"
)
SELECT
    "id", "username", COALESCE("name", "username"::text), "image", "created_at", "updated_at"
FROM "users";

CREATE UNIQUE INDEX "profiles_username_key" ON "profiles"("username");

ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "users_username_key";
ALTER TABLE "users" DROP COLUMN "username";
