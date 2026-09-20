import {
  createLogger,
  getOrCreateRequestId,
  withRequestId,
} from "@townhawll/observability";
import type { NextRequest } from "next/server";

const logger = createLogger("admin");

export function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers);
  withRequestId(logger, requestId).debug({ event: "health_check" });

  return Response.json(
    { status: "ok" },
    {
      headers: {
        "cache-control": "no-store",
        "x-request-id": requestId,
      },
    },
  );
}
