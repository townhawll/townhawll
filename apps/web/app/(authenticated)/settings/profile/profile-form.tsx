"use client";

import { Button, ImageUploader, Input, Label, Spinner } from "@townhawll/ui";
import { getUsernameChangeState } from "@townhawll/profile/username-change";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { updateProfileAction, type ProfileEditActionState } from "./actions";
import { UsernameChangeDialog } from "./username-change-dialog";

interface ProfileFormValues {
  username: string;
  displayName: string;
  bio: string;
}

function FieldError({ errors }: Readonly<{ errors: string[] | undefined }>) {
  return errors?.length ? (
    <p className="text-sm text-danger" role="alert">
      {errors[0]}
    </p>
  ) : null;
}

function SaveButton({ disabled }: Readonly<{ disabled: boolean }>) {
  const { pending } = useFormStatus();
  return (
    <Button
      disabled={disabled || pending}
      id="save-profile-button"
      type="submit"
    >
      {pending ? (
        <>
          <Spinner aria-hidden="true" size={16} />
          Saving changes…
        </>
      ) : (
        "Save changes"
      )}
    </Button>
  );
}

export function ProfileForm({
  initialAvatarUrl,
  initialValues,
}: Readonly<{
  initialAvatarUrl: string | null;
  initialValues: ProfileFormValues;
}>) {
  const [state, action] = useActionState(
    updateProfileAction,
    {} as ProfileEditActionState,
  );
  const [values, setValues] = useState(initialValues);
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false);
  const [usernameDialogVersion, setUsernameDialogVersion] = useState(0);
  const usernameChange = getUsernameChangeState(
    initialValues.username,
    values.username,
  );
  const detailsDirty =
    values.displayName !== initialValues.displayName ||
    values.bio !== initialValues.bio;
  const dirty = detailsDirty || usernameChange.changed;

  function closeUsernameDialog() {
    setUsernameDialogOpen(false);
    requestAnimationFrame(() => {
      document.getElementById("save-profile-button")?.focus();
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!usernameChange.changed) return;
    event.preventDefault();
    setUsernameDialogVersion((version) => version + 1);
    setUsernameDialogOpen(true);
  }

  return (
    <div className="grid gap-8">
      <div>
        <ImageUploader
          endpoint="/api/profile/avatar"
          initialImageUrl={initialAvatarUrl}
          label="Avatar"
        />
        <p className="mt-1 text-xs text-foreground-muted">
          Avatar changes are saved immediately.
        </p>
      </div>

      <form
        action={action}
        className="grid gap-5"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="grid gap-2">
          <Label htmlFor="username">Username</Label>
          <Input
            aria-describedby="username-help"
            autoCapitalize="none"
            autoComplete="username"
            id="username"
            maxLength={30}
            name="username"
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                username: event.target.value,
              }))
            }
            required
            value={values.username}
          />
          <p className="text-xs text-foreground-muted" id="username-help">
            3–30 letters, numbers, or underscores. Usernames are lowercase.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            aria-describedby="display-name-error"
            aria-invalid={Boolean(state.fields?.displayName)}
            autoComplete="nickname"
            id="displayName"
            maxLength={80}
            name="displayName"
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
            required
            value={values.displayName}
          />
          <div id="display-name-error">
            <FieldError errors={state.fields?.displayName} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="bio">Bio (optional)</Label>
          <textarea
            aria-describedby="bio-help bio-error"
            aria-invalid={Boolean(state.fields?.bio)}
            className="min-h-28 w-full resize-y rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm leading-6 text-foreground transition-colors duration-fast placeholder:text-foreground-muted hover:border-border-strong aria-invalid:border-danger"
            id="bio"
            maxLength={500}
            name="bio"
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                bio: event.target.value,
              }))
            }
            rows={4}
            value={values.bio}
          />
          <div className="flex justify-between gap-4 text-xs text-foreground-muted">
            <span id="bio-help">Plain text, up to 500 characters.</span>
            <span aria-label={`${values.bio.length} of 500 characters`}>
              {values.bio.length}/500
            </span>
          </div>
          <div id="bio-error">
            <FieldError errors={state.fields?.bio} />
          </div>
        </div>

        {state.error ? (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        ) : null}

        <div className="flex justify-end border-t border-border-subtle pt-5">
          <SaveButton disabled={!dirty} />
        </div>
      </form>

      <UsernameChangeDialog
        key={`${usernameChange.normalizedUsername}-${usernameDialogVersion}`}
        currentUsername={initialValues.username}
        newUsername={usernameChange.normalizedUsername}
        onCancel={closeUsernameDialog}
        open={usernameDialogOpen}
      />
    </div>
  );
}
