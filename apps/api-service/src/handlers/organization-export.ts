import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import type { OrganizationExportOrgParamsInput, OrganizationExportQueryInput } from "@/validation/organization-export";

/** Returns the requested CSV export for an organization. */
export async function exportCsvHandler(
  c: AppContext,
  params: OrganizationExportOrgParamsInput,
  query: OrganizationExportQueryInput,
) {
  const actorUser = c.get("sessionUser");
  const actorRole = c.get("organizationRole");
  const exportInput = {
    organizationId: params.orgId,
    actorUserId: actorUser.id,
    actorRole,
  };

  switch (query.type) {
    case "project": {
      const exportFile = await c.get("services").organizationExport.exportProjectsCsv(exportInput);
      return buildCsvDownloadResponse(c, exportFile);
    }
    case "workspace": {
      const exportFile = await c.get("services").organizationExport.exportWorkspacesCsv(exportInput);
      return buildCsvDownloadResponse(c, exportFile);
    }
    case "usage": {
      const exportFile = await c.get("services").organizationExport.exportTokenUsageHourlyCsv(exportInput);
      return buildCsvDownloadResponse(c, exportFile);
    }
  }
}

function buildCsvDownloadResponse(c: AppContext, exportFile: { fileName: string; contentType: string; body: string }) {
  return c.body(exportFile.body, StatusCodes.OK, {
    "Content-Type": exportFile.contentType,
    "Content-Disposition": `attachment; filename="${exportFile.fileName}"`,
    "Cache-Control": "no-store",
  });
}
