import * as Sentry from "@sentry/nextjs";
import { parseAdminSentryDsn } from "@townhawll/config/public-env";
import { redactSentryEvent } from "@townhawll/observability/sentry";

const dsn = parseAdminSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN_ADMIN);

if (dsn) {
  Sentry.init({
    beforeSend: redactSentryEvent,
    dsn,
    initialScope: { tags: { service: "admin" } },
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}
