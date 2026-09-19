"use client";

import { Button, Input, Label, Spinner } from "@townhawll/ui";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { adminLoginAction, type AdminLoginActionState } from "./actions";

const initialState: AdminLoginActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? (
        <>
          <Spinner aria-hidden="true" size={16} />
          Signing in…
        </>
      ) : (
        "Sign in"
      )}
    </Button>
  );
}

function FieldError({ errors }: Readonly<{ errors: string[] | undefined }>) {
  return errors?.length ? (
    <p className="text-sm text-danger">{errors[0]}</p>
  ) : null;
}

export function AdminLoginForm({
  callbackUrl,
}: Readonly<{ callbackUrl: string }>) {
  const [state, action] = useActionState(adminLoginAction, initialState);

  return (
    <form action={action} className="mt-7 grid gap-5" noValidate>
      <input name="callbackUrl" type="hidden" value={callbackUrl} />
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          aria-describedby="email-error"
          aria-invalid={Boolean(state.fields?.email)}
          autoCapitalize="none"
          autoComplete="email"
          id="email"
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
          aria-describedby="password-error"
          aria-invalid={Boolean(state.fields?.password)}
          autoComplete="current-password"
          id="password"
          maxLength={128}
          name="password"
          required
          type="password"
        />
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
      <SubmitButton />
    </form>
  );
}
