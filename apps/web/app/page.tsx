import { Badge, Separator } from "@townhawll/ui";

export default function HomePage() {
  return (
    <main className="mx-auto grid min-h-screen w-[min(100%-2rem,48rem)] content-center gap-5 py-12">
      <Badge variant="accent">TownHawll</Badge>
      <h1 className="max-w-[18ch] text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        Your entertainment community is taking shape.
      </h1>
      <Separator />
      <p className="max-w-2xl text-base leading-7 text-foreground-secondary">
        The public web app is ready for the next MVP build step.
      </p>
    </main>
  );
}
