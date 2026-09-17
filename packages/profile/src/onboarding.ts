import type { ContentFocus } from "./index.ts";

export function needsOnboarding(completedAt: Date | null | undefined): boolean {
  return completedAt == null;
}

export function getInitialOnboardingStep(
  profileSavedAt: Date | null | undefined,
): 1 | 2 {
  return profileSavedAt == null ? 1 : 2;
}

export function getContentFocusDestination(focus: ContentFocus): string {
  switch (focus) {
    case "GAMES":
      return "/games";
    case "SCREEN":
      return "/screen";
    case "BOTH":
      return "/";
  }
}
