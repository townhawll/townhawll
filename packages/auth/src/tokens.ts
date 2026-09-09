import { createHash, randomBytes } from "node:crypto";

const AUTH_TOKEN_BYTES = 32;

export interface AuthTokenPair {
  token: string;
  tokenHash: string;
}

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createAuthToken(): AuthTokenPair {
  const token = randomBytes(AUTH_TOKEN_BYTES).toString("base64url");

  return {
    token,
    tokenHash: hashAuthToken(token),
  };
}
