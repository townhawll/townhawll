import * as Sentry from "@sentry/nextjs";
import { parseWebSentryDsn } from "@townhawll/config/public-env";
import { redactSentryEvent } from "@townhawll/observability/sentry";

const dsn = parseWebSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN_WEB);

if (dsn) {
  Sentry.init({
    beforeSend: redactSentryEvent,
    dsn,
    initialScope: { tags: { service: "web" } },
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}
