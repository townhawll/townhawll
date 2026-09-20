CREATE TYPE "StaffRole" AS ENUM (
    'CONTENT_EDITOR',
    'MODERATOR',
    'ADMIN',
    'TECHNICAL_ADMIN',
    'OWNER'
);

CREATE TABLE "staff_role_assignments" (
    "user_id" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_role_assignments_pkey" PRIMARY KEY ("user_id", "role")
);

CREATE INDEX "staff_role_assignments_role_idx"
ON "staff_role_assignments"("role");

ALTER TABLE "staff_role_assignments"
ADD CONSTRAINT "staff_role_assignments_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
