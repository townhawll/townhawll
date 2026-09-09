import { z } from "zod";

const runtimeEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const dbEnvironmentSchema = runtimeEnvironmentSchema.extend({
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) =>
        value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must use the postgresql:// or postgres:// protocol.",
    ),
});

const redisEnvironmentSchema = z.object({
  REDIS_URL: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("redis://") || value.startsWith("rediss://"),
      "REDIS_URL must use the redis:// or rediss:// protocol.",
    ),
});

const authEnvironmentSchema = z.object({
  AUTH_GOOGLE_ID: z.string().trim().min(1, "AUTH_GOOGLE_ID is required."),
  AUTH_GOOGLE_SECRET: z
    .string()
    .trim()
    .min(1, "AUTH_GOOGLE_SECRET is required."),
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must contain at least 32 characters."),
});

const emailEnvironmentSchema = z.object({
  APP_URL: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("http://") || value.startsWith("https://"),
      "APP_URL must use the http:// or https:// protocol.",
    ),
  EMAIL_FROM: z.string().trim().min(1, "EMAIL_FROM is required."),
  RESEND_API_KEY: z.string().trim().min(1, "RESEND_API_KEY is required."),
});

const serverEnvironmentSchema = dbEnvironmentSchema.extend(
  redisEnvironmentSchema.shape,
);

function invalidEnvironment(error: z.ZodError): Error {
  return new Error(`Invalid server environment:\n${z.prettifyError(error)}`);
}

export function loadDbEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const result = dbEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw invalidEnvironment(result.error);
  }

  return result.data;
}

export function loadRedisEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const result = redisEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw invalidEnvironment(result.error);
  }

  return result.data;
}

export function loadAuthEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const result = authEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw invalidEnvironment(result.error);
  }

  return result.data;
}

export function loadEmailEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const result = emailEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw invalidEnvironment(result.error);
  }

  return result.data;
}

export function loadServerEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const result = serverEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw invalidEnvironment(result.error);
  }

  return result.data;
}

export type DbEnvironment = z.infer<typeof dbEnvironmentSchema>;
export type RedisEnvironment = z.infer<typeof redisEnvironmentSchema>;
export type AuthEnvironment = z.infer<typeof authEnvironmentSchema>;
export type EmailEnvironment = z.infer<typeof emailEnvironmentSchema>;
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
