import { Badge, Separator } from "@townhawll/ui";

export default function AdminHomePage() {
  return (
    <main className="mx-auto grid min-h-screen w-[min(100%-2rem,48rem)] content-center gap-5 py-12">
      <Badge>TownHawll Admin</Badge>
      <h1 className="max-w-[18ch] text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        Staff operations will live here.
      </h1>
      <Separator />
      <p className="max-w-2xl text-sm leading-6 text-foreground-secondary">
        The admin app is isolated from the public app and ready for later MVP
        workflows.
      </p>
    </main>
  );
}
