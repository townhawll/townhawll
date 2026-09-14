import { z } from "zod";

const sentryDsnSchema = z
  .union([z.literal(""), z.url().refine((value) => /^https?:\/\//.test(value))])
  .optional();

function parseSentryDsn(value: string | undefined, variableName: string) {
  const result = sentryDsnSchema.safeParse(value?.trim());

  if (!result.success) {
    throw new Error(`${variableName} must be a valid URL when set.`);
  }

  return result.data || undefined;
}

export function parseWebSentryDsn(value: string | undefined) {
  return parseSentryDsn(value, "NEXT_PUBLIC_SENTRY_DSN_WEB");
}

export function parseAdminSentryDsn(value: string | undefined) {
  return parseSentryDsn(value, "NEXT_PUBLIC_SENTRY_DSN_ADMIN");
}
