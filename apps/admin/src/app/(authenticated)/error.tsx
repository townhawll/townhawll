"use client";

import * as Sentry from "@sentry/nextjs";
import { Button } from "@townhawll/ui";
import { useEffect } from "react";

export default function AuthenticatedAdminError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <section className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-start justify-center gap-3">
      <p className="text-sm font-medium text-danger">Unable to load</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        This admin page is unavailable
      </h1>
      <p className="text-sm leading-6 text-foreground-secondary">
        An unexpected error occurred. Try loading the page again.
      </p>
      <Button className="mt-2" onClick={reset}>
        Try again
      </Button>
    </section>
  );
}
