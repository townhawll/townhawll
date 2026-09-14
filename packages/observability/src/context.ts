import type { Logger } from "pino";

const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

export function getOrCreateRequestId(headers: Pick<Headers, "get">): string {
  const incoming = headers.get("x-request-id");
  return incoming && SAFE_REQUEST_ID.test(incoming)
    ? incoming
    : crypto.randomUUID();
}

export function withRequestId(logger: Logger, requestId: string): Logger {
  return logger.child({ requestId });
}
