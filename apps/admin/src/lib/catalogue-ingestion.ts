import { createCatalogueIngestionService } from "@townhawll/content/server";
import { getOrCreateRequestId } from "@townhawll/observability/context";
import { headers } from "next/headers";

import { requireCurrentStaff } from "./current-staff";

// Future actions bind the request-aware guard here; no caller-provided actor/roles.
export const catalogueIngestion = createCatalogueIngestionService({
  requireStaff: () => requireCurrentStaff(),
});
export async function catalogueImportContext() {
  return { requestId: getOrCreateRequestId(await headers()) };
}
