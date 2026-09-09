import type { Metadata } from "next";
import Link from "next/link";

import { GoogleAuthButton } from "../_components/google-auth-button";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account | TownHawll" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
      <p className="mt-2 text-sm leading-6 text-foreground-secondary">
        Join TownHawll to track and discuss the stories you love.
      </p>
      <GoogleAuthButton callbackUrl="/account" />
      <SignupForm />
      <p className="mt-5 text-center text-sm text-foreground-secondary">
        Already have an account?{" "}
        <Link
          className="font-medium text-accent hover:text-accent-hover"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
