"use client";

import { UserRound } from "lucide-react";
import { useState } from "react";

import { cn } from "../lib/cn";

export interface AvatarProps {
  alt: string;
  className?: string;
  fallback?: string;
  src?: string | null;
}

export function Avatar({ alt, className, fallback, src }: AvatarProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const showImage = Boolean(src && failedSource !== src);
  const fallbackInitial = fallback?.trim().charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden bg-surface-2 text-foreground-muted",
        className,
      )}
    >
      {showImage ? (
        <img
          alt={alt}
          className="size-full object-cover"
          onError={() => setFailedSource(src ?? null)}
          src={src ?? undefined}
        />
      ) : (
        <div
          aria-label={alt}
          className="grid size-full place-items-center"
          role="img"
        >
          {fallbackInitial ? (
            <span aria-hidden="true" className="text-[0.34em] font-semibold">
              {fallbackInitial}
            </span>
          ) : (
            <UserRound aria-hidden="true" className="size-[34%]" />
          )}
        </div>
      )}
    </div>
  );
}
