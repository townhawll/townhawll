import type { Session } from "next-auth";

export class AuthenticationRequiredError extends Error {
  override name = "AuthenticationRequiredError";
}

export class EmailVerificationRequiredError extends Error {
  override name = "EmailVerificationRequiredError";
}

export class AccountUnavailableError extends Error {
  override name = "AccountUnavailableError";
}

export function requireUser(session: Session | null) {
  if (session === null) {
    throw new AuthenticationRequiredError("Authentication is required.");
  }

  if (
    session.user.status === "SUSPENDED" ||
    session.user.status === "BANNED" ||
    session.user.status === "DELETED"
  ) {
    throw new AccountUnavailableError("This account is unavailable.");
  }

  return session.user;
}

export function requireVerifiedUser(session: Session | null) {
  const user = requireUser(session);

  if (user.emailVerified === null) {
    throw new EmailVerificationRequiredError("Email verification is required.");
  }

  return {
    ...user,
    emailVerified: user.emailVerified,
  };
}
