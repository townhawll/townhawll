import { normalizeUsername } from "./index.ts";

export function getUsernameChangeState(
  currentUsername: string,
  editedUsername: string,
): { changed: boolean; normalizedUsername: string } {
  const normalizedUsername = normalizeUsername(editedUsername);
  return {
    changed: normalizedUsername !== currentUsername,
    normalizedUsername,
  };
}

export function usernameConfirmationMatches(
  normalizedUsername: string,
  confirmation: string,
): boolean {
  return confirmation === normalizedUsername;
}
