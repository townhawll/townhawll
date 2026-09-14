import * as Sentry from "@sentry/nextjs";
import { loadAdminSentryEnvironment } from "@townhawll/config/server-env";
import { redactSentryEvent } from "@townhawll/observability/sentry";

export function register() {
  const { sentryDsn } = loadAdminSentryEnvironment();
  if (!sentryDsn) return;

  Sentry.init({
    beforeSend: redactSentryEvent,
    dsn: sentryDsn,
    initialScope: { tags: { service: "admin" } },
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

export const onRequestError = Sentry.captureRequestError;
