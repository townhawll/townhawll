"use client";

import { Input, Label } from "@townhawll/ui";
import { useActionState } from "react";

import { SubmitButton } from "../_components/submit-button";
import { resetPasswordAction, type ResetPasswordActionState } from "./actions";

const initialState: ResetPasswordActionState = {};

function FieldError({ errors }: Readonly<{ errors: string[] | undefined }>) {
  return errors?.[0] ? (
    <p className="text-sm text-danger">{errors[0]}</p>
  ) : null;
}

export function ResetPasswordForm({ token }: Readonly<{ token: string }>) {
  const [state, action] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={action} className="mt-6 grid gap-5" noValidate>
      <input name="token" type="hidden" value={token} />
      <div className="grid gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          aria-describedby="password-help password-error"
          aria-invalid={Boolean(state.fields?.password)}
          autoComplete="new-password"
          id="password"
          maxLength={128}
          minLength={8}
          name="password"
          required
          type="password"
        />
        <p className="text-xs text-foreground-muted" id="password-help">
          Use 8–128 characters.
        </p>
        <div id="password-error">
          <FieldError errors={state.fields?.password} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          aria-describedby="confirm-password-error"
          aria-invalid={Boolean(state.fields?.confirmPassword)}
          autoComplete="new-password"
          id="confirmPassword"
          maxLength={128}
          minLength={8}
          name="confirmPassword"
          required
          type="password"
        />
        <div id="confirm-password-error">
          <FieldError errors={state.fields?.confirmPassword} />
        </div>
      </div>
      {state.error ? (
        <p
          className="rounded-md bg-danger/10 p-3 text-sm text-danger"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Resetting…">Reset password</SubmitButton>
    </form>
  );
}
