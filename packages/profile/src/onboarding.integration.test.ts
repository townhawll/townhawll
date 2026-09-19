import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";

import {
  completeOnboarding,
  getOnboardingProfile,
  saveOnboardingProfile,
} from "./repository.ts";

const databaseUrl = process.env.DATABASE_URL;
const enabled = process.env.TOWNHAWLL_DB_INTEGRATION === "1";
let localDatabase = false;
if (databaseUrl) {
  try {
    localDatabase = ["localhost", "127.0.0.1"].includes(
      new URL(databaseUrl).hostname,
    );
  } catch {
    localDatabase = false;
  }
}

test(
  "onboarding persists steps, rejects duplicate usernames, and completes once",
  { skip: !enabled || !localDatabase },
  async () => {
    const { db } = await import("@townhawll/db");
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const username = `onboard_${suffix}`;
    const first = await db.user.create({
      data: { email: `${suffix}a@example.test` },
    });
    const second = await db.user.create({
      data: { email: `${suffix}b@example.test` },
    });

    try {
      expect(await completeOnboarding(first.id, "GAMES")).toBe(
        "profile_incomplete",
      );
      expect(
        await saveOnboardingProfile(first.id, {
          username: username.toUpperCase(),
          displayName: "Player",
          bio: "",
        }),
      ).toBe("saved");
      expect(
        await saveOnboardingProfile(second.id, {
          username,
          displayName: "Another player",
          bio: "",
        }),
      ).toBe("username_taken");
      const afterStepOne = await getOnboardingProfile(first.id);
      expect(afterStepOne?.profile?.username).toBe(username);
      expect(afterStepOne?.profile?.onboardingProfileSavedAt).toBeTruthy();
      expect(afterStepOne?.profile?.onboardingCompletedAt).toBe(null);

      expect(await completeOnboarding(first.id, "SCREEN")).toBe("completed");
      const completed = await getOnboardingProfile(first.id);
      expect(completed?.profile?.contentFocus).toBe("SCREEN");
      expect(completed?.profile?.onboardingCompletedAt).toBeTruthy();
      expect(await completeOnboarding(first.id, "BOTH")).toBe(
        "already_completed",
      );
    } finally {
      await db.user.deleteMany({
        where: { id: { in: [first.id, second.id] } },
      });
    }
  },
);
