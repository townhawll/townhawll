import { buttonVariants } from "@townhawll/ui";
import Link from "next/link";

export default function ProfileNotFound() {
  return (
    <main className="mx-auto grid min-h-screen w-[min(100%-2rem,40rem)] content-center gap-5 py-12">
      <div>
        <p className="text-sm font-semibold text-accent">TownHawll</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Profile not found
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-foreground-secondary">
          This profile does not exist or is not publicly available.
        </p>
      </div>
      <div>
        <Link className={buttonVariants({ variant: "secondary" })} href="/">
          Return home
        </Link>
      </div>
    </main>
  );
}
