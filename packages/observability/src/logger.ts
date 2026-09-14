import { loadObservabilityEnvironment } from "@townhawll/config/server-env";
import pino, { type DestinationStream, type LoggerOptions } from "pino";

import { redactSensitiveFields } from "@townhawll/observability/redact";

const sensitiveBindingPaths = [
  "password",
  "cookie",
  "cookies",
  "authorization",
  "sessionToken",
  "session_token",
  "verificationToken",
  "verification_token",
  "passwordResetToken",
  "password_reset_token",
  "resetToken",
  "reset_token",
  "access_token",
  "refresh_token",
  "apiKey",
  "api_key",
  "secret",
  "clientSecret",
  "client_secret",
  "token",
  "headers",
  "body",
  "request",
  "url",
  "email",
  "DATABASE_URL",
  "REDIS_URL",
];

export function createLogger(service: string, destination?: DestinationStream) {
  const environment = loadObservabilityEnvironment();

  const options: LoggerOptions = {
    base: { environment: environment.NODE_ENV, service },
    formatters: {
      bindings(object) {
        return redactSensitiveFields(object) as Record<string, unknown>;
      },
      log(object) {
        return redactSensitiveFields(object) as Record<string, unknown>;
      },
    },
    hooks: {
      logMethod(args, method) {
        // Pino otherwise copies err.message into the log message when no
        // explicit message is supplied, bypassing object-field redaction.
        if (args.length === 1 && typeof args[0] === "object") {
          return method.apply(this, [args[0], "Structured event"]);
        }
        return method.apply(this, args);
      },
    },
    level: environment.LOG_LEVEL,
    messageKey: "message",
    redact: { censor: "[Redacted]", paths: sensitiveBindingPaths },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return destination ? pino(options, destination) : pino(options);
}
