const REDACTED = "[Redacted]";

const sensitiveNames = new Set([
  "apikey",
  "authorization",
  "body",
  "clientsecret",
  "connectionstring",
  "cookie",
  "cookies",
  "credentials",
  "databaseurl",
  "dsn",
  "email",
  "headers",
  "idtoken",
  "password",
  "passwordresettoken",
  "query",
  "querystring",
  "redisurl",
  "refreshtoken",
  "request",
  "requestbody",
  "resettoken",
  "secret",
  "sessiontoken",
  "token",
  "verificationtoken",
  "url",
]);

function isSensitiveName(name: string): boolean {
  const normalized = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return (
    sensitiveNames.has(normalized) ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("token")
  );
}

function safeErrorType(value: string | undefined): string {
  return value && /^[A-Za-z][A-Za-z0-9_.$]{0,80}$/.test(value)
    ? value
    : "Error";
}

export function serializeSafeError(value: unknown): Record<string, string> {
  if (!(value instanceof Error)) return { type: "UnknownError" };

  // Error messages, causes, and stacks may contain tokens or provider payloads.
  return { type: safeErrorType(value.name) };
}

export function redactSensitiveFields(value: unknown): unknown {
  const seen = new WeakSet<object>();

  function visit(current: unknown, depth: number): unknown {
    if (current instanceof Error) return serializeSafeError(current);
    if (current === null || typeof current !== "object") return current;
    if (seen.has(current)) return "[Circular]";
    if (depth >= 6) return "[Truncated]";
    seen.add(current);

    if (Array.isArray(current)) {
      return current.slice(0, 30).map((item) => visit(item, depth + 1));
    }

    const result: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(current),
    ).slice(0, 60)) {
      if (isSensitiveName(key)) {
        result[key] = REDACTED;
      } else if ("value" in descriptor) {
        result[key] = visit(descriptor.value, depth + 1);
      }
    }
    return result;
  }

  return visit(value, 0);
}

export function redactSentryEvent<T extends object>(event: T): T {
  const safeEvent = { ...event } as Record<string, unknown>;
  delete safeEvent.request;
  delete safeEvent.user;
  delete safeEvent.extra;
  delete safeEvent.breadcrumbs;
  delete safeEvent.contexts;
  delete safeEvent.message;
  delete safeEvent.logentry;
  delete safeEvent.fingerprint;
  delete safeEvent.transaction;
  const service = (safeEvent.tags as { service?: unknown } | undefined)
    ?.service;
  if (typeof service === "string" && /^[a-z][a-z0-9_-]{0,40}$/.test(service)) {
    safeEvent.tags = { service };
  } else {
    delete safeEvent.tags;
  }

  const exception = safeEvent.exception as
    | {
        values?: Array<{
          type?: string;
          value?: string;
          stacktrace?: {
            frames?: Array<{
              filename?: string;
              function?: string;
              lineno?: number;
              colno?: number;
              in_app?: boolean;
            }>;
          };
        }>;
      }
    | undefined;
  if (exception?.values) {
    safeEvent.exception = {
      values: exception.values.map((entry) => ({
        type: safeErrorType(entry.type),
        value: safeErrorType(entry.type),
        stacktrace: entry.stacktrace
          ? {
              frames: entry.stacktrace.frames?.map((frame) => ({
                filename: frame.filename?.split(/[?#]/, 1)[0],
                function: frame.function,
                lineno: frame.lineno,
                colno: frame.colno,
                in_app: frame.in_app,
              })),
            }
          : undefined,
      })),
    };
  }

  return safeEvent as T;
}
