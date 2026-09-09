"use client";

import { Input, Label } from "@townhawll/ui";
import Link from "next/link";
import { useActionState } from "react";

import { SubmitButton } from "../_components/submit-button";
import { loginAction, type LoginActionState } from "./actions";

const initialState: LoginActionState = {};

function FieldError({ errors }: Readonly<{ errors: string[] | undefined }>) {
  return errors?.length ? (
    <p className="text-sm text-danger">{errors[0]}</p>
  ) : null;
}

export function LoginForm({ callbackUrl }: Readonly<{ callbackUrl: string }>) {
  const [state, action] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="mt-6 grid gap-5" noValidate>
      <input name="callbackUrl" type="hidden" value={callbackUrl} />
      <div className="grid gap-2">
        <Label htmlFor="identifier">Username or email</Label>
        <Input
          aria-describedby="identifier-error"
          aria-invalid={Boolean(state.fields?.identifier)}
          autoCapitalize="none"
          autoComplete="username"
          id="identifier"
          maxLength={254}
          name="identifier"
          required
        />
        <div id="identifier-error">
          <FieldError errors={state.fields?.identifier} />
        </div>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="password">Password</Label>
          <Link
            className="text-xs font-medium text-accent hover:text-accent-hover"
            href="/forgot-password"
          >
            Forgot password?
          </Link>
        </div>
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
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      <p className="text-center text-sm text-foreground-secondary">
        New to TownHawll?{" "}
        <Link
          className="font-medium text-accent hover:text-accent-hover"
          href="/signup"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
