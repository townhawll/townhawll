"use client";

import { Input, Label } from "@townhawll/ui";
import { useActionState } from "react";

import { SubmitButton } from "../_components/submit-button";
import { signupAction, type SignupActionState } from "./actions";

const initialState: SignupActionState = {};

function FieldError({ errors }: Readonly<{ errors: string[] | undefined }>) {
  return errors?.length ? (
    <p className="text-sm text-danger">{errors[0]}</p>
  ) : null;
}

export function SignupForm() {
  const [state, action] = useActionState(signupAction, initialState);
  return (
    <form action={action} className="mt-6 grid gap-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          aria-describedby="username-error"
          aria-invalid={Boolean(state.fields?.username)}
          autoComplete="username"
          id="username"
          maxLength={30}
          name="username"
          required
        />
        <div id="username-error">
          <FieldError errors={state.fields?.username} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          aria-describedby="email-error"
          aria-invalid={Boolean(state.fields?.email)}
          autoComplete="email"
          id="email"
          inputMode="email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
        <div id="email-error">
          <FieldError errors={state.fields?.email} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
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
      {state.error ? (
        <p
          className="rounded-md bg-danger/10 p-3 text-sm text-danger"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
