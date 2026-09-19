export interface RequestHeaders {
  get(name: string): string | null;
}

export function getClientIp(headers: RequestHeaders): string {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || headers.get("x-real-ip") || "unknown";
}
