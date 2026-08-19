/**
 * FileCommands — the public command surface for the Files feature.
 *
 * Phase 6 contract: declares the operations the Files feature exposes to UI
 * and flows. Owned by `features/files/commands/fileCommands.ts`; conformance
 * enforces the surface at typecheck time so a renamed/removed export fails.
 */
import type * as fileCommands from "./fileCommands";
import type * as whiteboardCommands from "./whiteboardCommands";

export type FileCommands = {
  listFiles: typeof fileCommands.listFiles;
  listFilesBatch: typeof fileCommands.listFilesBatch;
  searchFiles: typeof fileCommands.searchFiles;
  readFile: typeof fileCommands.readFile;
  resolveChatFilePath: typeof fileCommands.resolveChatFilePath;
  writeFile: typeof fileCommands.writeFile;
  createFile: typeof fileCommands.createFile;
  createFolder: typeof fileCommands.createFolder;
  renameEntry: typeof fileCommands.renameEntry;
  deleteEntry: typeof fileCommands.deleteEntry;
  openEntryInExternalApp: typeof fileCommands.openEntryInExternalApp;
  listDetectedExternalAppIds: typeof fileCommands.listDetectedExternalAppIds;
  readExternalClipboardSourcePaths: typeof fileCommands.readExternalClipboardSourcePaths;
  buildWorkspaceFileUrl: typeof fileCommands.buildWorkspaceFileUrl;
  copyFiles: typeof fileCommands.copyFiles;
  writeFileBase64: typeof fileCommands.writeFileBase64;
  createNewWhiteboard: typeof whiteboardCommands.createNewWhiteboard;
  resolveNextWhiteboardPath: typeof whiteboardCommands.resolveNextWhiteboardPath;
};
