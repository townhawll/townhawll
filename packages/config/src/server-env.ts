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
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
