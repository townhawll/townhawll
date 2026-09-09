export const DEFAULT_AUTHENTICATED_DESTINATION = "/account";

export function getSafeCallbackUrl(
  value: string | null | undefined,
  fallback = DEFAULT_AUTHENTICATED_DESTINATION,
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }

  try {
    const baseUrl = new URL("https://townhawll.invalid");
    const callbackUrl = new URL(value, baseUrl);
    return callbackUrl.origin === baseUrl.origin
      ? `${callbackUrl.pathname}${callbackUrl.search}${callbackUrl.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export function getLoginUrl(callbackUrl: string): string {
  const loginUrl = new URL("https://townhawll.invalid/login");
  loginUrl.searchParams.set("callbackUrl", getSafeCallbackUrl(callbackUrl));
  return `${loginUrl.pathname}${loginUrl.search}`;
}
