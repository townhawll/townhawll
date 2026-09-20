"use client";

import type { Permission } from "@townhawll/auth/permissions";
import type { StaffContext } from "@townhawll/auth/staff-context";
import { Button } from "@townhawll/ui";
import { Menu, X } from "lucide-react";
import { useRef } from "react";

import { AdminSidebar } from "./admin-sidebar";

export function MobileAdminNavigation({
  permissions,
  roles,
}: Readonly<{
  permissions: readonly Permission[];
  roles: StaffContext["roles"];
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <Button
        aria-label="Open admin navigation"
        className="size-9 p-0 md:hidden"
        onClick={() => dialogRef.current?.showModal()}
        size="sm"
        variant="ghost"
      >
        <Menu aria-hidden="true" className="size-5" />
      </Button>
      <dialog
        aria-label="Admin navigation"
        className="m-0 h-dvh max-h-none w-[min(19rem,88vw)] max-w-none border-0 border-r border-border-default bg-surface-1 p-0 text-foreground shadow-overlay backdrop:bg-black/65 md:hidden"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        ref={dialogRef}
      >
        <div className="absolute right-3 top-3 z-10">
          <Button
            aria-label="Close admin navigation"
            className="size-9 p-0"
            onClick={close}
            size="sm"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
        </div>
        <AdminSidebar
          onNavigate={close}
          permissions={permissions}
          roles={roles}
        />
      </dialog>
    </>
  );
}
