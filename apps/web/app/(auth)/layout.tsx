import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-screen w-[min(100%-2rem,28rem)] flex-col justify-center py-12">
      <Link
        className="mb-8 w-fit text-sm font-semibold tracking-wide text-accent hover:text-accent-hover"
        href="/"
      >
        TownHawll
      </Link>
      <section className="rounded-xl border border-border-default bg-surface-1 p-6 shadow-overlay sm:p-8">
        {children}
      </section>
    </main>
  );
}
