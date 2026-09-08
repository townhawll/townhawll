import { LoaderCircle } from "lucide-react";

import { cn } from "../lib/cn";

export interface SpinnerProps {
  className?: string;
  label?: string;
  size?: number;
}

export function Spinner({
  className,
  label = "Loading",
  size = 16,
}: SpinnerProps) {
  return (
    <span className="inline-flex items-center" role="status">
      <LoaderCircle
        aria-hidden="true"
        className={cn("animate-spin motion-reduce:animate-none", className)}
        size={size}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
