import type { ComponentProps } from "react";

import { cn } from "../lib/cn";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "text-sm font-medium text-foreground peer-disabled:cursor-not-allowed peer-disabled:text-foreground-disabled",
        className,
      )}
      {...props}
    />
  );
}
