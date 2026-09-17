import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

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

void test(
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
      assert.equal(
        await completeOnboarding(first.id, "GAMES"),
        "profile_incomplete",
      );
      assert.equal(
        await saveOnboardingProfile(first.id, {
          username: username.toUpperCase(),
          displayName: "Player",
          bio: "",
        }),
        "saved",
      );
      assert.equal(
        await saveOnboardingProfile(second.id, {
          username,
          displayName: "Another player",
          bio: "",
        }),
        "username_taken",
      );
      const afterStepOne = await getOnboardingProfile(first.id);
      assert.equal(afterStepOne?.profile?.username, username);
      assert.ok(afterStepOne?.profile?.onboardingProfileSavedAt);
      assert.equal(afterStepOne?.profile?.onboardingCompletedAt, null);

      assert.equal(await completeOnboarding(first.id, "SCREEN"), "completed");
      const completed = await getOnboardingProfile(first.id);
      assert.equal(completed?.profile?.contentFocus, "SCREEN");
      assert.ok(completed?.profile?.onboardingCompletedAt);
      assert.equal(
        await completeOnboarding(first.id, "BOTH"),
        "already_completed",
      );
    } finally {
      await db.user.deleteMany({
        where: { id: { in: [first.id, second.id] } },
      });
    }
  },
);
