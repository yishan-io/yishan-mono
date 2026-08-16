import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";

export const WORKSPACE_FILE_PROTOCOL = "yishan-file";
export const WORKSPACE_FILE_PROTOCOL_HOST = "workspace-file";

function isPathWithinOrEqual(rootPath: string, candidatePath: string): boolean {
  const normalizedRootPath = resolve(rootPath);
  const normalizedCandidatePath = resolve(candidatePath);
  return normalizedCandidatePath === normalizedRootPath || normalizedCandidatePath.startsWith(`${normalizedRootPath}/`);
}

/**
 * Registers the yishan-file:// workspace-file protocol handler.
 *
 * Serves files inside one workspace worktree with path-escape protection and
 * Range-request byte serving (required for <audio>/<video> seeking).
 */
export function registerWorkspaceFileProtocol(): void {
  protocol.handle(WORKSPACE_FILE_PROTOCOL, async (request) => {
    try {
      const parsedUrl = new URL(request.url);
      if (parsedUrl.hostname !== WORKSPACE_FILE_PROTOCOL_HOST) {
        return new Response("Not found", { status: 404 });
      }

      const workspaceWorktreePath = parsedUrl.searchParams.get("workspaceWorktreePath")?.trim() ?? "";
      const relativePath = parsedUrl.searchParams.get("relativePath")?.trim() ?? "";
      if (!workspaceWorktreePath || !relativePath) {
        return new Response("Missing workspaceWorktreePath or relativePath", { status: 400 });
      }

      const resolvedWorktreePath = resolve(workspaceWorktreePath);
      const resolvedFilePath = resolve(resolvedWorktreePath, relativePath);
      if (!isPathWithinOrEqual(resolvedWorktreePath, resolvedFilePath)) {
        return new Response("Path escapes workspace root", { status: 403 });
      }

      const fileUrl = pathToFileURL(resolvedFilePath).toString();

      // Handle Range requests (required for <audio>/<video> seeking)
      const rangeHeader = request.headers.get("Range");
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          const fileStat = await stat(resolvedFilePath);
          const fileSize = fileStat.size;
          const start = match[1] ? Number.parseInt(match[1], 10) : 0;
          const end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1;
          const chunkSize = end - start + 1;

          // Use net.fetch for the file:// URL — it handles byte serving natively
          const fileResponse = await net.fetch(fileUrl, {
            headers: { Range: rangeHeader },
          });

          if (fileResponse.status === 206) {
            return fileResponse;
          }

          // Fallback: read the chunk ourselves
          const buffer = Buffer.alloc(chunkSize);
          const fd = await import("node:fs/promises").then((m) => m.open(resolvedFilePath, "r"));
          await fd.read(buffer, 0, chunkSize, start);
          await fd.close();

          const mimeType = fileResponse.headers.get("Content-Type") ?? "application/octet-stream";
          return new Response(buffer, {
            status: 206,
            headers: {
              "Content-Type": mimeType,
              "Content-Range": `bytes ${start}-${end}/${fileSize}`,
              "Content-Length": `${chunkSize}`,
              "Accept-Ranges": "bytes",
            },
          });
        }
      }

      // No Range header — return the full file (no stat() needed)
      const fileResponse = await net.fetch(fileUrl);
      const headers = new Headers(fileResponse.headers);
      headers.set("Accept-Ranges", "bytes");
      return new Response(fileResponse.body, {
        status: fileResponse.status,
        headers,
      });
    } catch {
      return new Response("Failed to read workspace file", { status: 500 });
    }
  });
}
