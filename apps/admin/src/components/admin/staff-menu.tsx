"use client";

import type { StaffContext } from "@townhawll/auth/staff-context";
import { Avatar, Badge, Button, Separator } from "@townhawll/ui";
import { ExternalLink, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { adminLogoutAction } from "@/app/_actions/logout";
import { getStaffRoleSummary } from "@/lib/staff-display";

export function StaffMenu({
  email,
  name,
  publicAppUrl,
  roles,
  username,
}: Readonly<{
  email: string;
  name: string | null;
  publicAppUrl: string;
  roles: StaffContext["roles"];
  username: string | null;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const identity = name?.trim() || email;
  const roleSummary = getStaffRoleSummary(roles);
  const profileUrl = username
    ? new URL(`/u/${username}`, publicAppUrl).toString()
    : null;

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 transition-colors duration-fast hover:bg-surface-hover"
        onClick={() => setIsOpen((open) => !open)}
        ref={triggerRef}
        type="button"
      >
        <Avatar
          alt={`${identity} avatar`}
          className="size-8 rounded-full border border-border-default text-5xl text-foreground-secondary"
          fallback={identity}
        />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-48 truncate text-sm font-medium text-foreground">
            {identity}
          </span>
          <span className="block max-w-48 truncate text-xs text-foreground-muted">
            {roleSummary}
          </span>
        </span>
      </button>
      {isOpen ? (
        <div
          aria-label="Staff account"
          className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-border-default bg-surface-2 p-2 shadow-overlay"
          role="menu"
        >
          <div className="px-2 py-2">
            <p className="truncate text-sm font-medium text-foreground">
              {identity}
            </p>
            <p className="mt-0.5 truncate text-xs text-foreground-muted">
              {email}
            </p>
            <Badge className="mt-2 max-w-full truncate" variant="neutral">
              {roleSummary}
            </Badge>
          </div>
          <Separator className="my-1" />
          {profileUrl ? (
            <a
              className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
              href={profileUrl}
              role="menuitem"
            >
              <UserRound aria-hidden="true" className="size-4" />
              View public profile
              <ExternalLink
                aria-hidden="true"
                className="ml-auto size-3.5 text-foreground-muted"
              />
            </a>
          ) : null}
          <a
            className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
            href={publicAppUrl}
            role="menuitem"
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            Back to TownHawll
          </a>
          <form action={adminLogoutAction}>
            <Button
              className="h-9 w-full justify-start px-2 font-medium"
              role="menuitem"
              type="submit"
              variant="ghost"
            >
              <LogOut aria-hidden="true" className="size-4" />
              Log out
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
