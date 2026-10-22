-- CreateEnum
CREATE TYPE "AdminAuditResult" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateEnum
CREATE TYPE "CatalogueImportType" AS ENUM ('IMPORT_TITLE');

-- CreateEnum
CREATE TYPE "CatalogueImportStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "admin_audit_events" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_roles" "StaffRole"[],
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(100) NOT NULL,
    "target_id" VARCHAR(128),
    "result" "AdminAuditResult" NOT NULL,
    "reason" VARCHAR(500),
    "changes" JSONB NOT NULL,
    "request_id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_import_operations" (
    "id" TEXT NOT NULL,
    "type" "CatalogueImportType" NOT NULL DEFAULT 'IMPORT_TITLE',
    "status" "CatalogueImportStatus" NOT NULL DEFAULT 'PENDING',
    "actor_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_entity" TEXT NOT NULL,
    "provider_external_id" TEXT NOT NULL,
    "title_type" "TitleType" NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failure_code" VARCHAR(64),
    "failure_retryable" BOOLEAN NOT NULL DEFAULT false,
    "result_title_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogue_import_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_events_actor_id_created_at_idx" ON "admin_audit_events"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_events_target_type_target_id_created_at_idx" ON "admin_audit_events"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_events_action_created_at_idx" ON "admin_audit_events"("action", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_events_request_id_idx" ON "admin_audit_events"("request_id");

-- CreateIndex
CREATE INDEX "catalogue_import_operations_provider_provider_entity_provid_idx" ON "catalogue_import_operations"("provider", "provider_entity", "provider_external_id");

-- CreateIndex
CREATE INDEX "catalogue_import_operations_status_updated_at_idx" ON "catalogue_import_operations"("status", "updated_at");

-- CreateIndex
CREATE INDEX "catalogue_import_operations_actor_id_created_at_idx" ON "catalogue_import_operations"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "catalogue_import_operations_result_title_id_idx" ON "catalogue_import_operations"("result_title_id");

-- CreateIndex
CREATE UNIQUE INDEX "catalogue_import_operations_actor_id_type_idempotency_key_key" ON "catalogue_import_operations"("actor_id", "type", "idempotency_key");

-- AddForeignKey
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_import_operations" ADD CONSTRAINT "catalogue_import_operations_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_import_operations" ADD CONSTRAINT "catalogue_import_operations_result_title_id_fkey" FOREIGN KEY ("result_title_id") REFERENCES "titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One active execution reservation per qualified primary provider identity.
CREATE UNIQUE INDEX catalogue_import_active_identity_key
    ON catalogue_import_operations (provider, provider_entity, provider_external_id)
    WHERE status IN ('PENDING', 'RUNNING');

ALTER TABLE catalogue_import_operations ADD CONSTRAINT catalogue_import_identity_check CHECK (
    (provider = 'TMDB' AND provider_entity = 'movie' AND title_type = 'MOVIE') OR
    (provider = 'TMDB' AND provider_entity = 'series' AND title_type = 'SERIES') OR
    (provider = 'IGDB' AND provider_entity = 'game' AND title_type = 'GAME')
);
ALTER TABLE catalogue_import_operations ADD CONSTRAINT catalogue_import_fields_check CHECK (
    provider_external_id ~ '^[1-9][0-9]{0,29}$' AND
    idempotency_key ~ '^[A-Za-z0-9_-]{8,128}$' AND request_hash ~ '^[a-f0-9]{64}$' AND
    version >= 0 AND attempt_count >= 0 AND updated_at >= created_at AND
    (started_at IS NULL OR started_at >= created_at) AND
    (completed_at IS NULL OR completed_at >= COALESCE(started_at, created_at))
);
ALTER TABLE catalogue_import_operations ADD CONSTRAINT catalogue_import_state_check CHECK (
    (status = 'PENDING' AND started_at IS NULL AND completed_at IS NULL AND result_title_id IS NULL AND failure_code IS NULL AND NOT failure_retryable) OR
    (status = 'RUNNING' AND started_at IS NOT NULL AND completed_at IS NULL AND result_title_id IS NULL AND attempt_count > 0 AND failure_code IS NULL AND NOT failure_retryable) OR
    (status = 'SUCCEEDED' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND result_title_id IS NOT NULL AND attempt_count > 0 AND failure_code IS NULL AND NOT failure_retryable) OR
    (status = 'FAILED' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND result_title_id IS NULL AND attempt_count > 0 AND
        failure_code IS NOT NULL AND failure_code IN ('VALIDATION_FAILED', 'EXACT_DUPLICATE', 'PROVIDER_UNAVAILABLE', 'DATABASE_UNAVAILABLE') AND
        failure_retryable = (failure_code IN ('PROVIDER_UNAVAILABLE', 'DATABASE_UNAVAILABLE'))) OR
    (status = 'CANCELLED' AND completed_at IS NOT NULL AND result_title_id IS NULL AND failure_code IS NULL AND NOT failure_retryable)
);

CREATE FUNCTION enforce_catalogue_import_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'PENDING' OR NEW.version <> 0 OR NEW.attempt_count <> 0 THEN
            RAISE EXCEPTION 'Import operations must begin pending with no attempts' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF ROW(NEW.id, NEW.type, NEW.actor_id, NEW.provider, NEW.provider_entity, NEW.provider_external_id,
           NEW.title_type, NEW.idempotency_key, NEW.request_hash, NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.type, OLD.actor_id, OLD.provider, OLD.provider_entity, OLD.provider_external_id,
           OLD.title_type, OLD.idempotency_key, OLD.request_hash, OLD.created_at) THEN
        RAISE EXCEPTION 'Import identity and request scope are immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.version <> OLD.version + 1 OR NOT (
        (OLD.status = 'PENDING' AND NEW.status IN ('RUNNING', 'CANCELLED')) OR
        (OLD.status = 'RUNNING' AND NEW.status IN ('SUCCEEDED', 'FAILED', 'CANCELLED')) OR
        (OLD.status = 'FAILED' AND (NEW.status = 'CANCELLED' OR (NEW.status = 'PENDING' AND OLD.failure_retryable)))
    ) THEN
        RAISE EXCEPTION 'Invalid import lifecycle transition or version' USING ERRCODE = '23514';
    END IF;
    IF NEW.attempt_count <> OLD.attempt_count + (CASE WHEN NEW.status = 'RUNNING' THEN 1 ELSE 0 END) OR
       (NEW.status NOT IN ('RUNNING', 'PENDING') AND NEW.started_at IS DISTINCT FROM OLD.started_at) THEN
        RAISE EXCEPTION 'Invalid import attempt tracking' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'SUCCEEDED' THEN
        PERFORM 1 FROM titles t JOIN title_provider_mappings m ON m.title_id = t.id
        WHERE t.id = NEW.result_title_id AND t.type = NEW.title_type AND
              m.provider = NEW.provider AND m.provider_id = NEW.provider_entity || ':' || NEW.provider_external_id
        FOR SHARE OF t, m;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Successful import must resolve to a matching canonical title and provider mapping' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER catalogue_import_transition BEFORE INSERT OR UPDATE ON catalogue_import_operations
    FOR EACH ROW EXECUTE FUNCTION enforce_catalogue_import_transition();

-- Candidate prefilter only. The shared Unicode normalizer remains authoritative.
CREATE FUNCTION catalogue_duplicate_name_key(input text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT btrim(regexp_replace(lower(normalize(translate(COALESCE(input, ''), '™®©', ''), NFKC)), '[^[:alnum:]]+', ' ', 'g'))
$$;
CREATE INDEX titles_duplicate_name_key_idx ON titles (type, catalogue_duplicate_name_key(title));
CREATE INDEX titles_duplicate_original_key_idx ON titles (type, catalogue_duplicate_name_key(original_title));
CREATE INDEX title_aliases_duplicate_name_key_idx ON title_aliases (catalogue_duplicate_name_key(name), title_id);

ALTER TABLE admin_audit_events ALTER COLUMN actor_roles SET NOT NULL;
ALTER TABLE admin_audit_events ADD CONSTRAINT admin_audit_safe_shape_check CHECK (
    cardinality(actor_roles) <= 5 AND action ~ '^[a-z][a-zA-Z0-9_.-]{1,99}$' AND
    target_type ~ '^[a-z][a-zA-Z0-9_.-]{1,99}$' AND request_id ~ '^[A-Za-z0-9_-]{8,128}$' AND
    jsonb_typeof(changes) = 'object' AND octet_length(changes::text) <= 16384 AND
    (action !~ '^(staff\.|moderation\.|system\.|featureFlag\.)' OR (reason IS NOT NULL AND length(btrim(reason)) > 0))
);
CREATE FUNCTION prevent_admin_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Admin audit history is append-only' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER admin_audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION prevent_admin_audit_mutation();
