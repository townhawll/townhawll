"use client";

import { Button, Spinner, type ButtonProps } from "@townhawll/ui";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  variant,
}: Readonly<{
  children: React.ReactNode;
  pendingLabel: string;
  variant?: ButtonProps["variant"];
}>) {
  const { pending } = useFormStatus();

  return (
    <Button
      className="w-full"
      disabled={pending}
      type="submit"
      variant={variant}
    >
      {pending ? (
        <>
          <Spinner aria-hidden="true" size={16} />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
