import { buttonVariants } from "@townhawll/ui";
import Link from "next/link";

export default function AdminNotFound() {
  return (
    <main className="mx-auto grid min-h-screen w-[min(100%-2rem,36rem)] content-center gap-3 py-12">
      <p className="text-sm font-semibold text-accent">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm leading-6 text-foreground-secondary">
        The admin page you requested does not exist.
      </p>
      <Link
        className={buttonVariants({ className: "mt-2 w-fit", size: "sm" })}
        href="/dashboard"
      >
        Back to Dashboard
      </Link>
    </main>
  );
}
