import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";

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

void test("request IDs propagate only when they contain safe characters", () => {
  assert.equal(
    getOrCreateRequestId(new Headers({ "x-request-id": "job_12345678" })),
    "job_12345678",
  );

  const generated = getOrCreateRequestId(
    new Headers({ "x-request-id": "unsafe/payload" }),
  );
  assert.match(generated, /^[0-9a-f-]{36}$/);
});

void test("sensitive fields and error details are removed recursively", () => {
  assert.deepEqual(
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
    {
      authorization: "[Redacted]",
      nested: {
        password: "[Redacted]",
        session_token: "[Redacted]",
        safeId: "user_1",
      },
      request: "[Redacted]",
      url: "[Redacted]",
      err: { type: "Error" },
    },
  );
  assert.deepEqual(serializeSafeError("secret"), { type: "UnknownError" });
});

void test("Pino writes structured JSON without credentials or raw error messages", () => {
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
  assert.equal(record.service, "test");
  assert.equal(record.event, "auth_failure");
  assert.equal(record.level, 50);
  assert.equal(record.password, "[Redacted]");
  assert.equal(record.headers, "[Redacted]");
  assert.deepEqual(record.err, { type: "Error" });
  assert.doesNotMatch(output, /private-/);

  logger
    .child({ sessionToken: "private-child" })
    .info({ event: "child_event" });
  const childRecord = JSON.parse(output.trim().split("\n")[1] ?? "") as Record<
    string,
    unknown
  >;
  assert.equal(childRecord.sessionToken, "[Redacted]");
  assert.doesNotMatch(output, /private-child/);
});

void test("observability env defaults safely and rejects invalid values", () => {
  assert.equal(loadObservabilityEnvironment({}).LOG_LEVEL, "info");
  assert.equal(parseWebSentryDsn(undefined), undefined);
  assert.equal(parseAdminSentryDsn(""), undefined);
  assert.throws(() => parseWebSentryDsn("invalid"));
  assert.throws(() => parseAdminSentryDsn("javascript:alert(1)"));
  assert.throws(() => loadObservabilityEnvironment({ LOG_LEVEL: "verbose" }));
});

void test("each app validates only its own optional Sentry DSN", () => {
  const webDsn = "https://public@example.invalid/1";
  const adminDsn = "https://public@example.invalid/2";

  assert.equal(
    loadWebSentryEnvironment({
      NEXT_PUBLIC_SENTRY_DSN_WEB: webDsn,
      NEXT_PUBLIC_SENTRY_DSN_ADMIN: "invalid",
    }).sentryDsn,
    webDsn,
  );
  assert.equal(
    loadAdminSentryEnvironment({
      NEXT_PUBLIC_SENTRY_DSN_WEB: "invalid",
      NEXT_PUBLIC_SENTRY_DSN_ADMIN: adminDsn,
    }).sentryDsn,
    adminDsn,
  );
  assert.equal(loadWebSentryEnvironment({}).sentryDsn, undefined);
  assert.equal(loadAdminSentryEnvironment({}).sentryDsn, undefined);
  assert.throws(() =>
    loadWebSentryEnvironment({ NEXT_PUBLIC_SENTRY_DSN_WEB: "invalid" }),
  );
  assert.throws(() =>
    loadAdminSentryEnvironment({ NEXT_PUBLIC_SENTRY_DSN_ADMIN: "invalid" }),
  );
});

void test("Sentry payloads omit request data and exception messages", () => {
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

  assert.equal("request" in event, false);
  assert.equal("user" in event, false);
  assert.equal("breadcrumbs" in event, false);
  assert.deepEqual(event.exception.values, [
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
