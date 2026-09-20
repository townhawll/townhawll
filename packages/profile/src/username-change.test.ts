import { expect, test } from "vitest";

import {
  getUsernameChangeState,
  usernameConfirmationMatches,
} from "./username-change.ts";
import { usernameChangeSchema } from "./index.ts";

test("username confirmation is required only for a changed username", () => {
  expect(getUsernameChangeState("takshil", " TaKsHiL ")).toStrictEqual({
    changed: false,
    normalizedUsername: "takshil",
  });
  expect(getUsernameChangeState("takshil", "takshilcodes")).toStrictEqual({
    changed: true,
    normalizedUsername: "takshilcodes",
  });
});

test("confirmation requires the exact normalized username", () => {
  expect(usernameConfirmationMatches("takshilcodes", "")).toBe(false);
  expect(usernameConfirmationMatches("takshilcodes", "TakshilCodes")).toBe(
    false,
  );
  expect(usernameConfirmationMatches("takshilcodes", "takshilcodes")).toBe(
    true,
  );
});

test("server schema rejects a confirmation that does not match", () => {
  expect(
    usernameChangeSchema.safeParse({
      username: "TakshilCodes",
      confirmation: "TakshilCodes",
    }).success,
  ).toBe(false);
  expect(
    usernameChangeSchema.safeParse({
      username: "TakshilCodes",
      confirmation: "takshilcodes",
    }).success,
  ).toBe(true);
});
