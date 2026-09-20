import { z } from "zod";

import {
  parseAdminSentryDsn,
  parseWebSentryDsn,
} from "@townhawll/config/public-env";

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

const appEnvironmentSchema = z.object({
  APP_URL: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("http://") || value.startsWith("https://"),
      "APP_URL must use the http:// or https:// protocol.",
    ),
});

const emailEnvironmentSchema = appEnvironmentSchema.extend({
  EMAIL_FROM: z.string().trim().min(1, "EMAIL_FROM is required."),
  RESEND_API_KEY: z.string().trim().min(1, "RESEND_API_KEY is required."),
});

const observabilityEnvironmentSchema = runtimeEnvironmentSchema.extend({
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const optionalTrimmedString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const storageEnvironmentSchema = runtimeEnvironmentSchema.extend({
  STORAGE_DRIVER: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["local", "r2"]).optional(),
  ),
  R2_ACCOUNT_ID: optionalTrimmedString,
  R2_ACCESS_KEY_ID: optionalTrimmedString,
  R2_SECRET_ACCESS_KEY: optionalTrimmedString,
  R2_BUCKET_NAME: optionalTrimmedString,
  R2_PUBLIC_URL: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z
      .string()
      .url()
      .refine(
        (value) => value.startsWith("https://") || value.startsWith("http://"),
        "R2_PUBLIC_URL must use the http:// or https:// protocol.",
      )
      .optional(),
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

export function loadAppEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const result = appEnvironmentSchema.safeParse(environment);

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

export function loadObservabilityEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const result = observabilityEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw invalidEnvironment(result.error);
  }

  return result.data;
}

export type StorageEnvironment =
  | { driver: "local"; nodeEnv: "development" | "test" }
  | {
      driver: "r2";
      nodeEnv: "development" | "test" | "production";
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucketName: string;
      publicUrl: string;
    };

export function loadStorageEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): StorageEnvironment {
  const result = storageEnvironmentSchema.safeParse(environment);
  if (!result.success) throw invalidEnvironment(result.error);

  const values = result.data;
  const r2Values = [
    values.R2_ACCOUNT_ID,
    values.R2_ACCESS_KEY_ID,
    values.R2_SECRET_ACCESS_KEY,
    values.R2_BUCKET_NAME,
    values.R2_PUBLIC_URL,
  ];
  const hasAnyR2Value = r2Values.some(Boolean);
  const hasAllR2Values = r2Values.every(Boolean);
  const driver = values.STORAGE_DRIVER ?? (hasAllR2Values ? "r2" : "local");

  if (hasAnyR2Value && !hasAllR2Values) {
    throw new Error(
      "Invalid server environment: all R2 variables are required when any R2 variable is configured.",
    );
  }
  if (driver === "local") {
    if (values.NODE_ENV === "production") {
      throw new Error(
        "Invalid server environment: production object storage must use the r2 driver.",
      );
    }
    return { driver, nodeEnv: values.NODE_ENV };
  }
  if (!hasAllR2Values) {
    throw new Error(
      "Invalid server environment: the r2 storage driver requires all R2 variables.",
    );
  }

  return {
    driver,
    nodeEnv: values.NODE_ENV,
    accountId: values.R2_ACCOUNT_ID!,
    accessKeyId: values.R2_ACCESS_KEY_ID!,
    secretAccessKey: values.R2_SECRET_ACCESS_KEY!,
    bucketName: values.R2_BUCKET_NAME!,
    publicUrl: values.R2_PUBLIC_URL!,
  };
}

export function loadWebSentryEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return {
    sentryDsn: parseWebSentryDsn(environment.NEXT_PUBLIC_SENTRY_DSN_WEB),
  };
}

export function loadAdminSentryEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return {
    sentryDsn: parseAdminSentryDsn(environment.NEXT_PUBLIC_SENTRY_DSN_ADMIN),
  };
}

export type DbEnvironment = z.infer<typeof dbEnvironmentSchema>;
export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type RedisEnvironment = z.infer<typeof redisEnvironmentSchema>;
export type AuthEnvironment = z.infer<typeof authEnvironmentSchema>;
export type EmailEnvironment = z.infer<typeof emailEnvironmentSchema>;
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type ObservabilityEnvironment = ReturnType<
  typeof loadObservabilityEnvironment
>;
