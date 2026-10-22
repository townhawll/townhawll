import type { ImportStatus, ImportTransitionInput } from "./contracts.ts";
import { CatalogueImportError } from "./errors.ts";

const transitions: Readonly<Record<ImportStatus, readonly ImportStatus[]>> = {
  PENDING: ["RUNNING", "CANCELLED"],
  RUNNING: ["SUCCEEDED", "FAILED", "CANCELLED"],
  FAILED: ["PENDING", "CANCELLED"],
  SUCCEEDED: [],
  CANCELLED: [],
};
export function assertImportTransition(
  current: ImportStatus,
  next: ImportTransitionInput,
) {
  if (
    !transitions[current].includes(next.status) ||
    (next.status === "SUCCEEDED") !== !!next.resultTitleId ||
    (next.status === "FAILED") !== !!next.failureCode
  )
    throw new CatalogueImportError("INVALID_TRANSITION");
}
