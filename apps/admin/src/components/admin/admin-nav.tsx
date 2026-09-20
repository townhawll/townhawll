"use client";

import type { Permission } from "@townhawll/auth/permissions";
import { cn } from "@townhawll/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { getVisibleAdminNavigation } from "@/lib/admin-navigation";

export function AdminNav({
  permissions,
  onNavigate,
}: Readonly<{
  permissions: readonly Permission[];
  onNavigate?: () => void;
}>) {
  const pathname = usePathname();
  const items = getVisibleAdminNavigation(new Set(permissions));

  return (
    <nav aria-label="Admin navigation" className="grid gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-foreground-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-foreground",
              active && "bg-accent-muted text-foreground",
            )}
            href={item.href}
            key={item.href}
            {...(onNavigate ? { onClick: onNavigate } : {})}
          >
            <Icon
              aria-hidden="true"
              className={cn("size-4", active && "text-accent")}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
