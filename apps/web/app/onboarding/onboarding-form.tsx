"use client";

import { Button, ImageUploader, Input, Label } from "@townhawll/ui";
import { useActionState, useState } from "react";

import { SubmitButton } from "../(auth)/_components/submit-button";
import { logoutAction } from "../(authenticated)/account/actions";
import {
  completeOnboardingAction,
  saveOnboardingProfileAction,
  type OnboardingFocusActionState,
  type OnboardingProfileActionState,
} from "./actions";

const focusOptions = [
  { value: "GAMES", label: "Games", description: "Start with games." },
  {
    value: "SCREEN",
    label: "Movies & shows",
    description: "Start with movies and shows.",
  },
  { value: "BOTH", label: "Both", description: "Explore everything." },
] as const;

function FieldError({ errors }: Readonly<{ errors: string[] | undefined }>) {
  return errors?.length ? (
    <p className="text-sm text-danger">{errors[0]}</p>
  ) : null;
}

export function OnboardingForm({
  avatarUrl,
  initialStep,
  initialValues,
}: Readonly<{
  avatarUrl: string | null;
  initialStep: 1 | 2;
  initialValues: {
    username: string;
    displayName: string;
    bio: string;
    contentFocus: "GAMES" | "SCREEN" | "BOTH" | null;
  };
}>) {
  const [profileState, profileAction] = useActionState(
    saveOnboardingProfileAction,
    { version: 0 } as OnboardingProfileActionState,
  );
  const [focusState, focusAction] = useActionState(
    completeOnboardingAction,
    {} as OnboardingFocusActionState,
  );
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const step =
    editVersion !== null && editVersion === profileState.version
      ? 1
      : profileState.saved
        ? 2
        : initialStep;
  const profileValues = profileState.values ?? initialValues;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          {step === 1 ? "Step 1 / 2" : "Step 2 / 2"}
        </p>
        <span className="text-xs text-foreground-muted">About a minute</span>
      </div>
      <div className="mt-4 flex gap-1" aria-hidden="true">
        <span className="h-1 flex-1 rounded-sm bg-accent" />
        <span
          className={`h-1 flex-1 rounded-sm ${step === 2 ? "bg-accent" : "bg-border-default"}`}
        />
      </div>

      {step === 1 ? (
        <>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Your profile
          </h1>
          <p className="mt-2 text-sm leading-6 text-foreground-secondary">
            Choose the name people will see on TownHawll.
          </p>
          <form action={profileAction} className="mt-6 grid gap-5" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                aria-describedby="username-help username-error"
                aria-invalid={Boolean(profileState.fields?.username)}
                autoCapitalize="none"
                autoComplete="username"
                defaultValue={profileValues.username}
                id="username"
                maxLength={30}
                name="username"
                required
              />
              <p className="text-xs text-foreground-muted" id="username-help">
                3–30 letters, numbers, or underscores.
              </p>
              <div id="username-error">
                <FieldError errors={profileState.fields?.username} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                aria-describedby="display-name-error"
                aria-invalid={Boolean(profileState.fields?.displayName)}
                autoComplete="nickname"
                defaultValue={profileValues.displayName}
                id="displayName"
                maxLength={80}
                name="displayName"
                required
              />
              <div id="display-name-error">
                <FieldError errors={profileState.fields?.displayName} />
              </div>
            </div>
            <ImageUploader
              endpoint="/api/profile/avatar"
              initialImageUrl={avatarUrl}
            />
            <div className="grid gap-2">
              <Label htmlFor="bio">Bio (optional)</Label>
              <textarea
                aria-describedby="bio-error"
                aria-invalid={Boolean(profileState.fields?.bio)}
                className="min-h-24 w-full resize-y rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted hover:border-border-strong aria-invalid:border-danger"
                defaultValue={profileValues.bio}
                id="bio"
                maxLength={500}
                name="bio"
                rows={3}
              />
              <div id="bio-error">
                <FieldError errors={profileState.fields?.bio} />
              </div>
            </div>
            {profileState.error ? (
              <p className="text-sm text-danger" role="alert">
                {profileState.error}
              </p>
            ) : null}
            <SubmitButton pendingLabel="Saving profile…">Continue</SubmitButton>
          </form>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Your TownHawll
          </h1>
          <p className="mt-2 text-sm leading-6 text-foreground-secondary">
            What would you like to see first? You can explore everything either
            way.
          </p>
          <form action={focusAction} className="mt-6 grid gap-5" noValidate>
            <fieldset aria-describedby="focus-error" className="grid gap-3">
              <legend className="mb-3 text-sm font-medium text-foreground">
                Content focus
              </legend>
              {focusOptions.map((option) => (
                <label
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border-default bg-surface-1 p-3 text-sm hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent-muted"
                  key={option.value}
                >
                  <input
                    className="size-4 shrink-0 accent-accent"
                    defaultChecked={initialValues.contentFocus === option.value}
                    name="contentFocus"
                    required
                    type="radio"
                    value={option.value}
                  />
                  <span>
                    <span className="block font-medium">{option.label}</span>
                    <span className="block text-xs text-foreground-secondary">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
              <div id="focus-error">
                <FieldError errors={focusState.fields?.contentFocus} />
              </div>
            </fieldset>
            {focusState.error ? (
              <p className="text-sm text-danger" role="alert">
                {focusState.error}
              </p>
            ) : null}
            <div className="flex gap-3">
              <Button
                onClick={() => setEditVersion(profileState.version)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Back
              </Button>
              <div className="flex-1">
                <SubmitButton pendingLabel="Finishing…">
                  Finish onboarding
                </SubmitButton>
              </div>
            </div>
          </form>
        </>
      )}
      <form action={logoutAction} className="mt-6 text-center">
        <input name="callbackUrl" type="hidden" value="/" />
        <Button className="text-xs" size="sm" type="submit" variant="ghost">
          Sign out
        </Button>
      </form>
    </>
  );
}
