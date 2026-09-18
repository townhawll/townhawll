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
  "onboarding",
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

export const onboardingProfileSchema = z.object({
  username: usernameSchema,
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a display name.")
    .max(80, "Display name must contain at most 80 characters."),
  bio: z.string().trim().max(500, "Bio must contain at most 500 characters."),
});

export const onboardingFocusSchema = z.object({
  contentFocus: contentFocusSchema,
});

export const profileDetailsSchema = onboardingProfileSchema.pick({
  displayName: true,
  bio: true,
});

export const usernameChangeSchema = z
  .object({
    username: usernameSchema,
    confirmation: z.string(),
  })
  .superRefine(({ username, confirmation }, context) => {
    if (confirmation !== username) {
      context.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: "Retype the new username exactly to confirm the change.",
      });
    }
  });

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
export type OnboardingProfileInput = z.infer<typeof onboardingProfileSchema>;
export type ProfileDetailsInput = z.infer<typeof profileDetailsSchema>;
export type UsernameChangeInput = z.infer<typeof usernameChangeSchema>;
