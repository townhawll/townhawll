import { staffRoleSchema } from "@townhawll/auth/permissions";
import { redactSensitiveFields } from "@townhawll/observability/redact";
import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const label = z.string().regex(/^[a-z][a-zA-Z0-9_.-]{1,99}$/);
function change<T extends z.ZodType>(value: T) {
  return z.strictObject({ before: value.nullable(), after: value.nullable() });
}
// Extend this allowlist with each actual domain action; never accept arbitrary raw payloads.
export const auditChangesSchema = z.strictObject({
  status: change(
    z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]),
  ).optional(),
  attemptCount: change(
    z.number().int().nonnegative().max(2_147_483_647),
  ).optional(),
  resultTitleId: change(id).optional(),
  failureCode: change(z.string().regex(/^[A-Z][A-Z_]{1,63}$/)).optional(),
  publicationStatus: change(
    z.enum(["DRAFT", "PUBLISHED", "HIDDEN", "ARCHIVED"]),
  ).optional(),
  reviewStatus: change(
    z.enum(["NEEDS_REVIEW", "APPROVED", "REJECTED"]),
  ).optional(),
  roles: change(z.array(staffRoleSchema).max(5)).optional(),
});
export const auditEventSchema = z.strictObject({
  actorId: id,
  actorRoles: z.array(staffRoleSchema).max(5),
  action: label,
  targetType: label,
  targetId: id.nullable(),
  result: z.enum(["SUCCESS", "FAILURE", "DENIED"]),
  reason: z.string().trim().min(1).max(500).nullable().default(null),
  changes: auditChangesSchema.default({}),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
});
export type AuditEventInput = z.input<typeof auditEventSchema>;

export function prepareAuditEvent(input: unknown) {
  // Strip recognized secrets at any depth before applying the strict field allowlist.
  const parsed = auditEventSchema.safeParse(redactSensitiveFields(input));
  if (!parsed.success) throw new Error("Invalid safe audit event.");
  if (
    /^(staff\.|moderation\.|system\.|featureFlag\.)/.test(parsed.data.action) &&
    !parsed.data.reason
  )
    throw new Error("This audit action requires a reason.");
  return { ...parsed.data, actorRoles: [...new Set(parsed.data.actorRoles)] };
}
