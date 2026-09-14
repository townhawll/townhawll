import * as Sentry from "@sentry/nextjs";
import { loadWebSentryEnvironment } from "@townhawll/config/server-env";
import { redactSentryEvent } from "@townhawll/observability/sentry";

export function register() {
  const { sentryDsn } = loadWebSentryEnvironment();
  if (!sentryDsn) return;

  Sentry.init({
    beforeSend: redactSentryEvent,
    dsn: sentryDsn,
    initialScope: { tags: { service: "web" } },
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

export const onRequestError = Sentry.captureRequestError;
