import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-border-default bg-surface-1 px-3 text-sm text-foreground transition-colors duration-fast placeholder:text-foreground-muted hover:border-border-strong disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-foreground-disabled aria-invalid:border-danger",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
