import { bootstrapFirstOwner } from "./bootstrap-owner.ts";

const email = process.argv.slice(2).find((argument) => argument !== "--");

if (!email) {
  process.stderr.write(
    "Usage: pnpm staff:bootstrap-owner -- owner@example.com\n",
  );
  process.exitCode = 1;
} else {
  try {
    const result = await bootstrapFirstOwner(email);
    process.stdout.write(`OWNER assigned to user ${result.userId}.\n`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bootstrap failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
