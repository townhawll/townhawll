import { hash, verify } from "@node-rs/argon2";

const ARGON2ID = 2;
const ARGON2_VERSION_19 = 1;

const passwordHashOptions = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  outputLen: 32,
  parallelism: 1,
  timeCost: 2,
  version: ARGON2_VERSION_19,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, passwordHashOptions);
}

export function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password);
}
