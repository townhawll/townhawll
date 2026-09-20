export function getAuthSessionCookieName(
  environment = process.env.NODE_ENV,
): string {
  return environment === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export function getAuthSessionCookieOptions(
  environment = process.env.NODE_ENV,
) {
  return {
    httpOnly: true,
    path: "/" as const,
    sameSite: "lax" as const,
    secure: environment === "production",
  };
}
