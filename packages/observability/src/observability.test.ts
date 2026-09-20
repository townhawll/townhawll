import { Writable } from "node:stream";
import { expect, test } from "vitest";

import {
  parseAdminSentryDsn,
  parseWebSentryDsn,
} from "@townhawll/config/public-env";
import {
  loadAdminSentryEnvironment,
  loadObservabilityEnvironment,
  loadWebSentryEnvironment,
} from "@townhawll/config/server-env";

import { getOrCreateRequestId } from "@townhawll/observability/context";
import { createLogger } from "@townhawll/observability/logger";
import {
  redactSensitiveFields,
  redactSentryEvent,
  serializeSafeError,
} from "@townhawll/observability/redact";

test("request IDs propagate only when they contain safe characters", () => {
  expect(
    getOrCreateRequestId(new Headers({ "x-request-id": "job_12345678" })),
  ).toBe("job_12345678");

  const generated = getOrCreateRequestId(
    new Headers({ "x-request-id": "unsafe/payload" }),
  );
  expect(generated).toMatch(/^[0-9a-f-]{36}$/);
});

test("sensitive fields and error details are removed recursively", () => {
  expect(
    redactSensitiveFields({
      authorization: "Bearer secret",
      nested: {
        password: "secret",
        session_token: "secret",
        safeId: "user_1",
      },
      request: { body: "secret" },
      url: "https://example.com/reset?token=secret",
      err: new Error("secret in message"),
    }),
  ).toStrictEqual({
    authorization: "[Redacted]",
    nested: {
      password: "[Redacted]",
      session_token: "[Redacted]",
      safeId: "user_1",
    },
    request: "[Redacted]",
    url: "[Redacted]",
    err: { type: "Error" },
  });
  expect(serializeSafeError("secret")).toStrictEqual({ type: "UnknownError" });
});

test("Pino writes structured JSON without credentials or raw error messages", () => {
  let output = "";
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const logger = createLogger("test", destination);

  logger.error({
    event: "auth_failure",
    err: new Error("private-provider-response"),
    password: "private-password",
    headers: { authorization: "private-header" },
  });

  const record = JSON.parse(output) as Record<string, unknown>;
  expect(record.service).toBe("test");
  expect(record.event).toBe("auth_failure");
  expect(record.level).toBe(50);
  expect(record.password).toBe("[Redacted]");
  expect(record.headers).toBe("[Redacted]");
  expect(record.err).toStrictEqual({ type: "Error" });
  expect(output).not.toMatch(/private-/);

  logger
    .child({ sessionToken: "private-child" })
    .info({ event: "child_event" });
  const childRecord = JSON.parse(output.trim().split("\n")[1] ?? "") as Record<
    string,
    unknown
  >;
  expect(childRecord.sessionToken).toBe("[Redacted]");
  expect(output).not.toMatch(/private-child/);
});

test("observability env defaults safely and rejects invalid values", () => {
  expect(loadObservabilityEnvironment({}).LOG_LEVEL).toBe("info");
  expect(parseWebSentryDsn(undefined)).toBe(undefined);
  expect(parseAdminSentryDsn("")).toBe(undefined);
  expect(() => parseWebSentryDsn("invalid")).toThrow();
  expect(() => parseAdminSentryDsn("javascript:alert(1)")).toThrow();
  expect(() =>
    loadObservabilityEnvironment({ LOG_LEVEL: "verbose" }),
  ).toThrow();
});

test("each app validates only its own optional Sentry DSN", () => {
  const webDsn = "https://public@example.invalid/1";
  const adminDsn = "https://public@example.invalid/2";

  expect(
    loadWebSentryEnvironment({
      NEXT_PUBLIC_SENTRY_DSN_WEB: webDsn,
      NEXT_PUBLIC_SENTRY_DSN_ADMIN: "invalid",
    }).sentryDsn,
  ).toBe(webDsn);
  expect(
    loadAdminSentryEnvironment({
      NEXT_PUBLIC_SENTRY_DSN_WEB: "invalid",
      NEXT_PUBLIC_SENTRY_DSN_ADMIN: adminDsn,
    }).sentryDsn,
  ).toBe(adminDsn);
  expect(loadWebSentryEnvironment({}).sentryDsn).toBe(undefined);
  expect(loadAdminSentryEnvironment({}).sentryDsn).toBe(undefined);
  expect(() =>
    loadWebSentryEnvironment({ NEXT_PUBLIC_SENTRY_DSN_WEB: "invalid" }),
  ).toThrow();
  expect(() =>
    loadAdminSentryEnvironment({ NEXT_PUBLIC_SENTRY_DSN_ADMIN: "invalid" }),
  ).toThrow();
});

test("Sentry payloads omit request data and exception messages", () => {
  const event = redactSentryEvent({
    breadcrumbs: [{ message: "secret" }],
    exception: {
      values: [
        {
          type: "Error",
          value: "secret",
          stacktrace: {
            frames: [
              {
                filename: "server.js",
                function: "run",
                lineno: 1,
                colno: 2,
                in_app: true,
                vars: { token: "secret" },
              },
            ],
          },
        },
      ],
    },
    request: { headers: { authorization: "secret" } },
    user: { email: "private@example.com" },
  });

  expect("request" in event).toBe(false);
  expect("user" in event).toBe(false);
  expect("breadcrumbs" in event).toBe(false);
  expect(event.exception.values).toStrictEqual([
    {
      type: "Error",
      value: "Error",
      stacktrace: {
        frames: [
          {
            filename: "server.js",
            function: "run",
            lineno: 1,
            colno: 2,
            in_app: true,
          },
        ],
      },
    },
  ]);
});
