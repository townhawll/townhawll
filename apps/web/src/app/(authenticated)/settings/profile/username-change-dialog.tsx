"use client";

import { Button, Input, Label, Spinner } from "@townhawll/ui";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  changeUsernameAction,
  type UsernameChangeActionState,
} from "./actions";

function FieldError({ errors }: Readonly<{ errors: string[] | undefined }>) {
  return errors?.length ? (
    <p className="text-sm text-danger" role="alert">
      {errors[0]}
    </p>
  ) : null;
}

function ConfirmButton({ disabled }: Readonly<{ disabled: boolean }>) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={disabled || pending} type="submit">
      {pending ? (
        <>
          <Spinner aria-hidden="true" size={16} />
          Changing username…
        </>
      ) : (
        "Change username"
      )}
    </Button>
  );
}

export function UsernameChangeDialog({
  currentUsername,
  newUsername,
  onCancel,
  open,
}: Readonly<{
  currentUsername: string;
  newUsername: string;
  onCancel: () => void;
  open: boolean;
}>) {
  const [confirmation, setConfirmation] = useState("");
  const [state, action] = useActionState(
    changeUsernameAction,
    {} as UsernameChangeActionState,
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    const animationFrame = requestAnimationFrame(() => {
      confirmationRef.current?.focus();
    });
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled])",
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel, open]);

  if (!open) return null;

  const matches = confirmation === newUsername;

  return (
    <div
      aria-modal="true"
      aria-describedby="username-change-description"
      aria-labelledby="username-change-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
    >
      <div
        className="w-full max-w-md rounded-lg border border-border-default bg-surface-2 p-5 shadow-overlay sm:p-6"
        ref={dialogRef}
      >
        <h2 className="text-xl font-semibold" id="username-change-title">
          Change username?
        </h2>
        <p
          className="mt-2 text-sm leading-6 text-foreground-secondary"
          id="username-change-description"
        >
          Your public profile URL will change. The old URL will stop pointing to
          your profile.
        </p>

        <dl className="mt-5 grid gap-3 rounded-md border border-border-subtle bg-surface-1 p-4 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-foreground-muted">Current username</dt>
            <dd className="break-all font-medium">@{currentUsername}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-foreground-muted">New username</dt>
            <dd className="break-all font-medium text-accent">
              @{newUsername}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-sm leading-6 text-foreground-secondary">
          Your new profile URL will be <strong>/u/{newUsername}</strong>.
        </p>

        <form action={action} className="mt-5 grid gap-2" noValidate>
          <input name="username" type="hidden" value={newUsername} />
          <Label htmlFor="username-confirmation">
            Retype <span className="font-mono">{newUsername}</span> to confirm
          </Label>
          <Input
            aria-describedby="username-confirmation-error"
            aria-invalid={Boolean(state.fields?.confirmation)}
            autoCapitalize="none"
            autoComplete="off"
            id="username-confirmation"
            name="confirmation"
            onChange={(event) => setConfirmation(event.target.value)}
            ref={confirmationRef}
            value={confirmation}
          />
          <div id="username-confirmation-error">
            <FieldError errors={state.fields?.confirmation} />
          </div>
          <FieldError errors={state.fields?.username} />
          {state.error ? (
            <p className="text-sm text-danger" role="alert">
              {state.error}
            </p>
          ) : null}

          <div className="mt-3 flex flex-col-reverse justify-end gap-2 sm:flex-row">
            <Button onClick={onCancel} type="button" variant="ghost">
              Cancel
            </Button>
            <ConfirmButton disabled={!matches} />
          </div>
        </form>
      </div>
    </div>
  );
}
