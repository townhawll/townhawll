"use client";

import { Input, Label } from "@townhawll/ui";
import { useActionState } from "react";
import { SubmitButton } from "../_components/submit-button";
import { resendVerificationAction, type ResendActionState } from "./actions";

const initialState: ResendActionState = {};

export function ResendForm() {
  const [state, action] = useActionState(
    resendVerificationAction,
    initialState,
  );
  return (
    <form action={action} className="mt-6 grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          autoComplete="email"
          id="email"
          inputMode="email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </div>
      {state.message ? (
        <p
          className="rounded-md bg-accent-muted p-3 text-sm text-foreground-secondary"
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Sending…">Resend verification</SubmitButton>
    </form>
  );
}
