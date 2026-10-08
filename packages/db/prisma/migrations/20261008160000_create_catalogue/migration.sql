-- CreateEnum
CREATE TYPE "IndustryAwardResult" AS ENUM ('WINNER', 'NOMINEE');

-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('POSTER', 'HERO_ART', 'PERSON_IMAGE', 'AVATAR', 'COLLECTION_COVER', 'PROFILE_BANNER', 'LOGO');

-- CreateEnum
CREATE TYPE "MediaSourceType" AS ENUM ('POSTER', 'BACKDROP', 'ARTWORK', 'COVER', 'PROFILE', 'LOGO', 'UPLOAD');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "MediaProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaVariantType" AS ENUM ('CARD', 'MASTER', 'OPTIMIZED');

-- CreateEnum
CREATE TYPE "VideoType" AS ENUM ('TRAILER', 'TEASER', 'GAMEPLAY', 'OTHER');

-- CreateEnum
CREATE TYPE "CreditType" AS ENUM ('CAST', 'CREW', 'CREATOR');

-- CreateEnum
CREATE TYPE "KeywordType" AS ENUM ('KEYWORD', 'THEME', 'TAG');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('DEVELOPER', 'PUBLISHER', 'PRODUCTION_COMPANY', 'STUDIO', 'NETWORK');

-- CreateEnum
CREATE TYPE "TitleType" AS ENUM ('MOVIE', 'SERIES', 'GAME');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NEEDS_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MovieStatus" AS ENUM ('PLANNED', 'IN_PRODUCTION', 'POST_PRODUCTION', 'RELEASED', 'CANCELED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SeriesStatus" AS ENUM ('RETURNING', 'ENDED', 'CANCELED', 'IN_PRODUCTION', 'PLANNED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "GameReleaseStatus" AS ENUM ('RELEASED', 'UPCOMING', 'DELAYED', 'CANCELLED', 'EARLY_ACCESS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('MAIN_GAME', 'DLC', 'EXPANSION', 'STANDALONE_EXPANSION', 'REMAKE', 'REMASTER', 'EDITION', 'BUNDLE', 'OTHER');

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('SINGLE_PLAYER', 'MULTIPLAYER', 'CO_OP', 'MMO', 'SPLIT_SCREEN');

-- CreateEnum
CREATE TYPE "SystemPlatform" AS ENUM ('WINDOWS', 'MACOS', 'LINUX');

-- CreateEnum
CREATE TYPE "RequirementTier" AS ENUM ('MINIMUM', 'RECOMMENDED');

-- CreateEnum
CREATE TYPE "TitleRelationType" AS ENUM ('DLC', 'EXPANSION', 'STANDALONE_EXPANSION', 'EDITION', 'REMAKE', 'REMASTER', 'SEQUEL', 'PREQUEL', 'SPIN_OFF', 'REBOOT', 'ADAPTATION', 'RELATED');

-- CreateTable
CREATE TABLE "industry_awards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "organizer" TEXT,
    "website_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industry_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industry_award_categories" (
    "id" TEXT NOT NULL,
    "industry_award_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "industry_award_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industry_award_entries" (
    "id" TEXT NOT NULL,
    "industry_award_category_id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "result" "IndustryAwardResult" NOT NULL,
    "source_url" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industry_award_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "title_id" TEXT,
    "season_id" TEXT,
    "person_id" TEXT,
    "purpose" "MediaPurpose" NOT NULL,
    "source_type" "MediaSourceType" NOT NULL,
    "provider" TEXT,
    "provider_asset_id" TEXT,
    "provider_source_url" TEXT,
    "source_hash" TEXT,
    "source_width" INTEGER,
    "source_height" INTEGER,
    "selection_reason" TEXT,
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'PUBLIC',
    "current_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_asset_versions" (
    "id" TEXT NOT NULL,
    "media_asset_id" TEXT NOT NULL,
    "processing_profile" TEXT NOT NULL,
    "processing_version" TEXT NOT NULL,
    "status" "MediaProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "source_hash" TEXT,
    "failure_stage" TEXT,
    "failure_message" TEXT,
    "activated_at" TIMESTAMP(3),
    "replaced_at" TIMESTAMP(3),
    "delete_after" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_asset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_variants" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "type" "MediaVariantType" NOT NULL,
    "object_key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "content_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_assets" (
    "id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "provider" TEXT,
    "provider_video_id" TEXT,
    "platform" TEXT NOT NULL,
    "external_key" TEXT NOT NULL,
    "type" "VideoType" NOT NULL,
    "name" TEXT,
    "official" BOOLEAN,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "language_code" TEXT,

    CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "biography" TEXT,
    "birthday" DATE,
    "deathday" DATE,
    "place_of_birth" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_provider_mappings" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_person_id" TEXT NOT NULL,

    CONSTRAINT "person_provider_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credits" (
    "id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "type" "CreditType" NOT NULL,
    "character_name" TEXT,
    "job" TEXT,
    "department" TEXT,
    "display_order" INTEGER,

    CONSTRAINT "credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platforms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_provider_mappings" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,

    CONSTRAINT "platform_provider_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_platforms" (
    "id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "release_date" DATE,
    "release_status" "GameReleaseStatus",

    CONSTRAINT "game_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genres" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_genres" (
    "title_id" TEXT NOT NULL,
    "genre_id" TEXT NOT NULL,

    CONSTRAINT "title_genres_pkey" PRIMARY KEY ("title_id","genre_id")
);

-- CreateTable
CREATE TABLE "keywords" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "KeywordType" NOT NULL,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_keywords" (
    "title_id" TEXT NOT NULL,
    "keyword_id" TEXT NOT NULL,

    CONSTRAINT "title_keywords_pkey" PRIMARY KEY ("title_id","keyword_id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_provider_mappings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_company_id" TEXT NOT NULL,

    CONSTRAINT "company_provider_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_companies" (
    "title_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "role" "CompanyRole" NOT NULL,

    CONSTRAINT "title_companies_pkey" PRIMARY KEY ("title_id","company_id","role")
);

-- CreateTable
CREATE TABLE "franchises" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "franchises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "franchise_provider_mappings" (
    "id" TEXT NOT NULL,
    "franchise_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_franchise_id" TEXT NOT NULL,

    CONSTRAINT "franchise_provider_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_franchises" (
    "title_id" TEXT NOT NULL,
    "franchise_id" TEXT NOT NULL,

    CONSTRAINT "title_franchises_pkey" PRIMARY KEY ("title_id","franchise_id")
);

-- CreateTable
CREATE TABLE "watch_providers" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "watch_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_watch_providers" (
    "id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "watch_provider_id" TEXT NOT NULL,
    "region_code" TEXT NOT NULL,
    "access_type" TEXT,

    CONSTRAINT "title_watch_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "titles" (
    "id" TEXT NOT NULL,
    "type" "TitleType" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "original_title" TEXT,
    "overview" TEXT,
    "primary_release_date" DATE,
    "is_anime" BOOLEAN NOT NULL DEFAULT false,
    "normalized_age_rating" TEXT,
    "effective_certification" TEXT,
    "effective_certification_system" TEXT,
    "effective_certification_country" TEXT,
    "provider_certifications" JSONB,
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_provider_mappings" (
    "id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "source_url" TEXT,
    "provider_popularity" DOUBLE PRECISION,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_updated_at" TIMESTAMP(3),

    CONSTRAINT "title_provider_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_snapshots" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "content_hash" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "provider_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_aliases" (
    "id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_key" TEXT NOT NULL,
    "provider" TEXT,
    "language_code" TEXT,

    CONSTRAINT "title_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movie_metadata" (
    "title_id" TEXT NOT NULL,
    "status" "MovieStatus" NOT NULL DEFAULT 'UNKNOWN',
    "runtime_minutes" INTEGER,
    "original_language_code" TEXT,
    "dubbed_language_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "production_country_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "movie_metadata_pkey" PRIMARY KEY ("title_id")
);

-- CreateTable
CREATE TABLE "series_metadata" (
    "title_id" TEXT NOT NULL,
    "last_air_date" DATE,
    "average_episode_runtime" INTEGER,
    "status" "SeriesStatus" NOT NULL DEFAULT 'UNKNOWN',
    "number_of_seasons" INTEGER,
    "number_of_episodes" INTEGER,
    "original_language_code" TEXT,
    "dubbed_language_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "origin_country_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "series_metadata_pkey" PRIMARY KEY ("title_id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "series_title_id" TEXT NOT NULL,
    "season_number" INTEGER NOT NULL,
    "name" TEXT,
    "air_date" DATE,
    "episode_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_provider_mappings" (
    "id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,

    CONSTRAINT "season_provider_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_metadata" (
    "title_id" TEXT NOT NULL,
    "release_status" "GameReleaseStatus" NOT NULL DEFAULT 'UNKNOWN',
    "game_type" "GameType" NOT NULL DEFAULT 'MAIN_GAME',
    "primary_language_code" TEXT,
    "modes" "GameMode"[] DEFAULT ARRAY[]::"GameMode"[],

    CONSTRAINT "game_metadata_pkey" PRIMARY KEY ("title_id")
);

-- CreateTable
CREATE TABLE "game_completion_times" (
    "title_id" TEXT NOT NULL,
    "main_story_minutes" INTEGER,
    "main_plus_extra_minutes" INTEGER,
    "completionist_minutes" INTEGER,
    "source" TEXT,
    "source_updated_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_completion_times_pkey" PRIMARY KEY ("title_id")
);

-- CreateTable
CREATE TABLE "game_system_requirements" (
    "id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "platform" "SystemPlatform" NOT NULL,
    "tier" "RequirementTier" NOT NULL,
    "os" TEXT,
    "cpu" TEXT,
    "gpu" TEXT,
    "ram_mb" INTEGER,
    "storage_mb" INTEGER,
    "direct_x" TEXT,
    "additional_notes" TEXT,
    "raw_text" TEXT,
    "source" TEXT,
    "source_updated_at" TIMESTAMP(3),

    CONSTRAINT "game_system_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_relations" (
    "id" TEXT NOT NULL,
    "source_title_id" TEXT NOT NULL,
    "target_title_id" TEXT NOT NULL,
    "type" "TitleRelationType" NOT NULL,

    CONSTRAINT "title_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "industry_awards_slug_key" ON "industry_awards"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "industry_award_categories_industry_award_id_slug_key" ON "industry_award_categories"("industry_award_id", "slug");

-- CreateIndex
CREATE INDEX "industry_award_entries_title_id_year_idx" ON "industry_award_entries"("title_id", "year");

-- CreateIndex
CREATE INDEX "industry_award_entries_industry_award_category_id_year_idx" ON "industry_award_entries"("industry_award_category_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "industry_award_entries_industry_award_category_id_title_id__key" ON "industry_award_entries"("industry_award_category_id", "title_id", "year");

-- CreateIndex
CREATE INDEX "media_assets_title_id_purpose_idx" ON "media_assets"("title_id", "purpose");

-- CreateIndex
CREATE INDEX "media_assets_season_id_purpose_idx" ON "media_assets"("season_id", "purpose");

-- CreateIndex
CREATE INDEX "media_assets_person_id_purpose_idx" ON "media_assets"("person_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_current_version_id_id_key" ON "media_assets"("current_version_id", "id");

-- CreateIndex
CREATE INDEX "media_asset_versions_media_asset_id_created_at_idx" ON "media_asset_versions"("media_asset_id", "created_at");

-- CreateIndex
CREATE INDEX "media_asset_versions_delete_after_idx" ON "media_asset_versions"("delete_after");

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_versions_id_media_asset_id_key" ON "media_asset_versions"("id", "media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_object_key_key" ON "media_variants"("object_key");

-- CreateIndex
CREATE UNIQUE INDEX "media_variants_version_id_type_key" ON "media_variants"("version_id", "type");

-- CreateIndex
CREATE INDEX "video_assets_title_id_selected_type_idx" ON "video_assets"("title_id", "selected", "type");

-- CreateIndex
CREATE UNIQUE INDEX "video_assets_title_id_platform_external_key_key" ON "video_assets"("title_id", "platform", "external_key");

-- CreateIndex
CREATE INDEX "person_provider_mappings_person_id_idx" ON "person_provider_mappings"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_provider_mappings_provider_provider_person_id_key" ON "person_provider_mappings"("provider", "provider_person_id");

-- CreateIndex
CREATE INDEX "credits_title_id_type_display_order_idx" ON "credits"("title_id", "type", "display_order");

-- CreateIndex
CREATE INDEX "credits_person_id_title_id_idx" ON "credits"("person_id", "title_id");

-- CreateIndex
CREATE UNIQUE INDEX "platforms_slug_key" ON "platforms"("slug");

-- CreateIndex
CREATE INDEX "platform_provider_mappings_platform_id_idx" ON "platform_provider_mappings"("platform_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_provider_mappings_provider_provider_id_key" ON "platform_provider_mappings"("provider", "provider_id");

-- CreateIndex
CREATE INDEX "game_platforms_platform_id_title_id_idx" ON "game_platforms"("platform_id", "title_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_platforms_title_id_platform_id_key" ON "game_platforms"("title_id", "platform_id");

-- CreateIndex
CREATE UNIQUE INDEX "genres_slug_key" ON "genres"("slug");

-- CreateIndex
CREATE INDEX "title_genres_genre_id_title_id_idx" ON "title_genres"("genre_id", "title_id");

-- CreateIndex
CREATE UNIQUE INDEX "keywords_type_slug_key" ON "keywords"("type", "slug");

-- CreateIndex
CREATE INDEX "title_keywords_keyword_id_title_id_idx" ON "title_keywords"("keyword_id", "title_id");

-- CreateIndex
CREATE INDEX "company_provider_mappings_company_id_idx" ON "company_provider_mappings"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_provider_mappings_provider_provider_company_id_key" ON "company_provider_mappings"("provider", "provider_company_id");

-- CreateIndex
CREATE INDEX "title_companies_company_id_title_id_idx" ON "title_companies"("company_id", "title_id");

-- CreateIndex
CREATE INDEX "franchise_provider_mappings_franchise_id_idx" ON "franchise_provider_mappings"("franchise_id");

-- CreateIndex
CREATE UNIQUE INDEX "franchise_provider_mappings_provider_provider_franchise_id_key" ON "franchise_provider_mappings"("provider", "provider_franchise_id");

-- CreateIndex
CREATE INDEX "title_franchises_franchise_id_title_id_idx" ON "title_franchises"("franchise_id", "title_id");

-- CreateIndex
CREATE UNIQUE INDEX "watch_providers_provider_provider_id_key" ON "watch_providers"("provider", "provider_id");

-- CreateIndex
CREATE INDEX "title_watch_providers_watch_provider_id_region_code_idx" ON "title_watch_providers"("watch_provider_id", "region_code");

-- CreateIndex
-- PG15+: absent access type is one distinct availability record, not unlimited duplicates.
CREATE UNIQUE INDEX "title_watch_providers_title_id_watch_provider_id_region_cod_key" ON "title_watch_providers"("title_id", "watch_provider_id", "region_code", "access_type") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "titles_slug_key" ON "titles"("slug");

-- CreateIndex
CREATE INDEX "titles_publication_status_type_primary_release_date_id_idx" ON "titles"("publication_status", "type", "primary_release_date" DESC, "id");

-- CreateIndex
CREATE INDEX "titles_type_is_anime_idx" ON "titles"("type", "is_anime");

-- CreateIndex
CREATE INDEX "titles_deleted_at_idx" ON "titles"("deleted_at");

-- CreateIndex
CREATE INDEX "title_provider_mappings_title_id_idx" ON "title_provider_mappings"("title_id");

-- CreateIndex
CREATE UNIQUE INDEX "title_provider_mappings_provider_provider_id_key" ON "title_provider_mappings"("provider", "provider_id");

-- CreateIndex
CREATE INDEX "provider_snapshots_provider_provider_id_entity_type_idx" ON "provider_snapshots"("provider", "provider_id", "entity_type");

-- CreateIndex
CREATE INDEX "provider_snapshots_expires_at_idx" ON "provider_snapshots"("expires_at");

-- CreateIndex
CREATE INDEX "title_aliases_normalized_key_idx" ON "title_aliases"("normalized_key");

-- CreateIndex
CREATE UNIQUE INDEX "title_aliases_title_id_normalized_key_key" ON "title_aliases"("title_id", "normalized_key");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_series_title_id_season_number_key" ON "seasons"("series_title_id", "season_number");

-- CreateIndex
CREATE INDEX "season_provider_mappings_season_id_idx" ON "season_provider_mappings"("season_id");

-- CreateIndex
CREATE UNIQUE INDEX "season_provider_mappings_provider_provider_id_key" ON "season_provider_mappings"("provider", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_system_requirements_title_id_platform_tier_key" ON "game_system_requirements"("title_id", "platform", "tier");

-- CreateIndex
CREATE INDEX "title_relations_target_title_id_type_idx" ON "title_relations"("target_title_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "title_relations_source_title_id_target_title_id_type_key" ON "title_relations"("source_title_id", "target_title_id", "type");

-- AddForeignKey
ALTER TABLE "industry_award_categories" ADD CONSTRAINT "industry_award_categories_industry_award_id_fkey" FOREIGN KEY ("industry_award_id") REFERENCES "industry_awards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "industry_award_entries" ADD CONSTRAINT "industry_award_entries_industry_award_category_id_fkey" FOREIGN KEY ("industry_award_category_id") REFERENCES "industry_award_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "industry_award_entries" ADD CONSTRAINT "industry_award_entries_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_current_version_id_id_fkey" FOREIGN KEY ("current_version_id", "id") REFERENCES "media_asset_versions"("id", "media_asset_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media_asset_versions" ADD CONSTRAINT "media_asset_versions_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "media_asset_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_provider_mappings" ADD CONSTRAINT "person_provider_mappings_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_provider_mappings" ADD CONSTRAINT "platform_provider_mappings_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_platforms" ADD CONSTRAINT "game_platforms_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_platforms" ADD CONSTRAINT "game_platforms_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_genres" ADD CONSTRAINT "title_genres_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_genres" ADD CONSTRAINT "title_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_keywords" ADD CONSTRAINT "title_keywords_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_keywords" ADD CONSTRAINT "title_keywords_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "keywords"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_provider_mappings" ADD CONSTRAINT "company_provider_mappings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_companies" ADD CONSTRAINT "title_companies_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_companies" ADD CONSTRAINT "title_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franchise_provider_mappings" ADD CONSTRAINT "franchise_provider_mappings_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "franchises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_franchises" ADD CONSTRAINT "title_franchises_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_franchises" ADD CONSTRAINT "title_franchises_franchise_id_fkey" FOREIGN KEY ("franchise_id") REFERENCES "franchises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_watch_providers" ADD CONSTRAINT "title_watch_providers_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_watch_providers" ADD CONSTRAINT "title_watch_providers_watch_provider_id_fkey" FOREIGN KEY ("watch_provider_id") REFERENCES "watch_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_provider_mappings" ADD CONSTRAINT "title_provider_mappings_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_aliases" ADD CONSTRAINT "title_aliases_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_metadata" ADD CONSTRAINT "movie_metadata_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_metadata" ADD CONSTRAINT "series_metadata_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_series_title_id_fkey" FOREIGN KEY ("series_title_id") REFERENCES "titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_provider_mappings" ADD CONSTRAINT "season_provider_mappings_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_metadata" ADD CONSTRAINT "game_metadata_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_completion_times" ADD CONSTRAINT "game_completion_times_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_system_requirements" ADD CONSTRAINT "game_system_requirements_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_relations" ADD CONSTRAINT "title_relations_source_title_id_fkey" FOREIGN KEY ("source_title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_relations" ADD CONSTRAINT "title_relations_target_title_id_fkey" FOREIGN KEY ("target_title_id") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Handwritten integrity rules: Prisma cannot express CHECKs, expression indexes,
-- NULLS NOT DISTINCT, or cross-table constraint triggers. Keep these in migrations.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_one_owner_check"
    CHECK (num_nonnulls(title_id, season_id, person_id) = 1);

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_supported_purpose_check"
    CHECK (purpose NOT IN ('AVATAR', 'COLLECTION_COVER', 'PROFILE_BANNER'));

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_source_dimensions_check"
    CHECK ((source_width IS NULL OR source_width > 0) AND (source_height IS NULL OR source_height > 0));

ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_dimensions_and_size_check"
    CHECK (width > 0 AND height > 0 AND byte_size >= 0);

ALTER TABLE "title_relations" ADD CONSTRAINT "title_relations_different_titles_check"
    CHECK (source_title_id <> target_title_id);

ALTER TABLE "movie_metadata" ADD CONSTRAINT "movie_metadata_runtime_check"
    CHECK (runtime_minutes >= 0);

ALTER TABLE "series_metadata" ADD CONSTRAINT "series_metadata_counts_check"
    CHECK (average_episode_runtime >= 0 AND number_of_seasons >= 0 AND number_of_episodes >= 0);

ALTER TABLE "seasons" ADD CONSTRAINT "seasons_counts_check"
    CHECK (season_number >= 0 AND episode_count >= 0);

ALTER TABLE "game_completion_times" ADD CONSTRAINT "game_completion_times_durations_check"
    CHECK (main_story_minutes >= 0 AND main_plus_extra_minutes >= 0 AND completionist_minutes >= 0);

ALTER TABLE "game_system_requirements" ADD CONSTRAINT "game_system_requirements_sizes_check"
    CHECK (ram_mb >= 0 AND storage_mb >= 0);

ALTER TABLE "credits" ADD CONSTRAINT "credits_display_order_check"
    CHECK (display_order >= 0);

ALTER TABLE "industry_award_entries" ADD CONSTRAINT "industry_award_entries_year_check"
    CHECK (year BETWEEN 1800 AND 2200);

ALTER TABLE "people" ADD CONSTRAINT "people_life_dates_check"
    CHECK (deathday >= birthday);

ALTER TABLE "titles" ADD CONSTRAINT "titles_certification_country_check"
    CHECK (effective_certification_country ~ '^[A-Z]{2}$');

ALTER TABLE "title_watch_providers" ADD CONSTRAINT "title_watch_providers_region_check"
    CHECK (region_code ~ '^[A-Z]{2}$');

-- RELATED is symmetric; all other relationships remain directional.
CREATE UNIQUE INDEX "title_relations_related_pair_key"
    ON "title_relations" (LEAST(source_title_id, target_title_id),
                         GREATEST(source_title_id, target_title_id))
    WHERE type = 'RELATED';

-- Lock the selected version so a concurrent status update cannot activate a
-- non-READY version. The composite FK separately enforces same-asset ownership.
CREATE FUNCTION check_current_media_version() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    selected_status "MediaProcessingStatus";
BEGIN
    IF NEW.current_version_id IS NOT NULL THEN
        SELECT status INTO selected_status
        FROM media_asset_versions
        WHERE id = NEW.current_version_id AND media_asset_id = NEW.id
        FOR SHARE;
        IF selected_status IS DISTINCT FROM 'READY'::"MediaProcessingStatus" THEN
            RAISE EXCEPTION 'Current media version must belong to the asset and be READY'
                USING ERRCODE = '23514', CONSTRAINT = 'media_assets_ready_version_check';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER media_assets_ready_version
    BEFORE INSERT OR UPDATE OF current_version_id, id ON media_assets
    FOR EACH ROW EXECUTE FUNCTION check_current_media_version();

CREATE FUNCTION preserve_current_media_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status <> 'READY' AND EXISTS (
        SELECT 1 FROM media_assets WHERE current_version_id = OLD.id
    ) THEN
        RAISE EXCEPTION 'An active media version must remain READY'
            USING ERRCODE = '23514', CONSTRAINT = 'media_asset_versions_active_ready_check';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER media_asset_versions_active_ready
    BEFORE UPDATE OF status ON media_asset_versions
    FOR EACH ROW EXECUTE FUNCTION preserve_current_media_version();

-- Deferred checks allow nested/transactional Title + metadata creation. A draft
-- may await hydration; PUBLISHED requires its matching metadata. Check both sides
-- of mutations, including deletion and moving a child between titles.
CREATE FUNCTION assert_catalogue_title_integrity(p_title_id text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    current_title titles%ROWTYPE;
    has_movie boolean;
    has_series boolean;
    has_game boolean;
BEGIN
    SELECT * INTO current_title FROM titles WHERE id = p_title_id FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT EXISTS (SELECT 1 FROM movie_metadata WHERE title_id = p_title_id),
           EXISTS (SELECT 1 FROM series_metadata WHERE title_id = p_title_id),
           EXISTS (SELECT 1 FROM game_metadata WHERE title_id = p_title_id)
    INTO has_movie, has_series, has_game;

    IF (has_movie AND current_title.type <> 'MOVIE')
       OR (has_series AND current_title.type <> 'SERIES')
       OR (has_game AND current_title.type <> 'GAME')
       OR (current_title.type <> 'SERIES' AND EXISTS (
           SELECT 1 FROM seasons WHERE series_title_id = p_title_id))
       OR (current_title.type <> 'GAME' AND (
           EXISTS (SELECT 1 FROM game_platforms WHERE title_id = p_title_id)
           OR EXISTS (SELECT 1 FROM game_system_requirements WHERE title_id = p_title_id)
           OR EXISTS (SELECT 1 FROM game_completion_times WHERE title_id = p_title_id)))
    THEN
        RAISE EXCEPTION 'Catalogue metadata does not match title type'
            USING ERRCODE = '23514', CONSTRAINT = 'titles_metadata_type_check';
    END IF;

    IF current_title.publication_status = 'PUBLISHED' AND NOT (
        (current_title.type = 'MOVIE' AND has_movie)
        OR (current_title.type = 'SERIES' AND has_series)
        OR (current_title.type = 'GAME' AND has_game))
    THEN
        RAISE EXCEPTION 'Published titles require matching specialized metadata'
            USING ERRCODE = '23514', CONSTRAINT = 'titles_published_metadata_check';
    END IF;
END;
$$;

CREATE FUNCTION check_catalogue_title_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    previous_id text;
    next_id text;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        previous_id := to_jsonb(OLD) ->> TG_ARGV[0];
    END IF;
    IF TG_OP <> 'DELETE' THEN
        next_id := to_jsonb(NEW) ->> TG_ARGV[0];
    END IF;
    IF previous_id IS NOT NULL THEN
        PERFORM assert_catalogue_title_integrity(previous_id);
    END IF;
    IF next_id IS NOT NULL AND next_id IS DISTINCT FROM previous_id THEN
        PERFORM assert_catalogue_title_integrity(next_id);
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "titles_title_integrity"
    AFTER INSERT OR UPDATE OR DELETE ON "titles"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_catalogue_title_integrity('id');

CREATE CONSTRAINT TRIGGER "movie_metadata_title_integrity"
    AFTER INSERT OR UPDATE OR DELETE ON "movie_metadata"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_catalogue_title_integrity('title_id');

CREATE CONSTRAINT TRIGGER "series_metadata_title_integrity"
    AFTER INSERT OR UPDATE OR DELETE ON "series_metadata"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_catalogue_title_integrity('title_id');

CREATE CONSTRAINT TRIGGER "game_metadata_title_integrity"
    AFTER INSERT OR UPDATE OR DELETE ON "game_metadata"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_catalogue_title_integrity('title_id');

CREATE CONSTRAINT TRIGGER "seasons_title_integrity"
    AFTER INSERT OR UPDATE OR DELETE ON "seasons"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_catalogue_title_integrity('series_title_id');

CREATE CONSTRAINT TRIGGER "game_platforms_title_integrity"
    AFTER INSERT OR UPDATE OR DELETE ON "game_platforms"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_catalogue_title_integrity('title_id');

CREATE CONSTRAINT TRIGGER "game_system_requirements_title_integrity"
    AFTER INSERT OR UPDATE OR DELETE ON "game_system_requirements"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_catalogue_title_integrity('title_id');

CREATE CONSTRAINT TRIGGER "game_completion_times_title_integrity"
    AFTER INSERT OR UPDATE OR DELETE ON "game_completion_times"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_catalogue_title_integrity('title_id');
