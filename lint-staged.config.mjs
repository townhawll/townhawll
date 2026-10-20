import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Type-aware ESLint must run from the workspace that owns each staged file.
const workspaceTasks = ["apps", "packages"].flatMap((directory) =>
  readdirSync(join(import.meta.dirname, directory), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(
          join(import.meta.dirname, directory, entry.name, "eslint.config.js"),
        ),
    )
    .map((entry) => {
      const workspace = `${directory}/${entry.name}`;
      return [
        `${workspace}/**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts}`,
        `pnpm --dir "${workspace}" exec eslint --fix --`,
      ];
    }),
);

export default {
  ...Object.fromEntries(workspaceTasks),
  // lint:staged runs tasks serially: formatting follows every ESLint fix.
  "*": "prettier --write --ignore-unknown",
};
