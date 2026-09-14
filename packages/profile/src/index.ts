import { z } from "zod";

const reservedUsernames = new Set([
  "account",
  "admin",
  "api",
  "auth",
  "games",
  "help",
  "login",
  "logout",
  "profile",
  "screen",
  "settings",
  "signup",
  "support",
  "townhawll",
  "u",
]);

export function normalizeUsername(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}

export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(3, "Username must contain at least 3 characters.")
      .max(30, "Username must contain at most 30 characters.")
      .regex(
        /^[a-z0-9_]+$/,
        "Username can contain only letters, numbers, and underscores.",
      )
      .refine(
        (username) => !reservedUsernames.has(username),
        "This username is reserved.",
      ),
  );

export const contentFocusSchema = z.enum(["GAMES", "SCREEN", "BOTH"]);

export const profileInputSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(500).optional(),
  avatarUrl: z
    .url()
    .refine((url) => /^https?:\/\//.test(url))
    .optional(),
  contentFocus: contentFocusSchema,
});

export type ContentFocus = z.infer<typeof contentFocusSchema>;
export type ProfileInput = z.infer<typeof profileInputSchema>;
