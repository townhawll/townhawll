"use client";

import { Input, Label } from "@townhawll/ui";
import { useActionState } from "react";

import { SubmitButton } from "../_components/submit-button";
import {
  forgotPasswordAction,
  type ForgotPasswordActionState,
} from "./actions";

const initialState: ForgotPasswordActionState = {};

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialState);

  return (
    <form action={action} className="mt-6 grid gap-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          aria-describedby="email-error"
          aria-invalid={Boolean(state.fields?.email)}
          autoCapitalize="none"
          autoComplete="email"
          id="email"
          inputMode="email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
        <div id="email-error">
          {state.fields?.email?.[0] ? (
            <p className="text-sm text-danger">{state.fields.email[0]}</p>
          ) : null}
        </div>
      </div>
      {state.message ? (
        <p
          className="rounded-md bg-accent-muted p-3 text-sm text-foreground-secondary"
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
