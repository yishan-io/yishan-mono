import type { WorkspaceFileEntry as CoreWorkspaceFileEntry } from "@yishan/core";

export type WorkspaceFileEntry = Pick<CoreWorkspaceFileEntry, "path"> & {
  isIgnored: boolean;
};

export type ExternalClipboardReadOutcome =
  | {
      kind: "success";
      sourcePaths: string[];
      clipboardFormats: string[];
      strategy: string;
    }
  | {
      kind: "supported";
      sourcePaths: string[];
      clipboardFormats: string[];
      strategy: string;
    }
  | {
      kind: "empty";
      sourcePaths: string[];
      clipboardFormats: string[];
      strategy: string;
    }
  | {
      kind: "permission-denied";
      sourcePaths: string[];
      clipboardFormats: string[];
      strategy: string;
      message: string;
    }
  | {
      kind: "parse-failed";
      sourcePaths: string[];
      clipboardFormats: string[];
      strategy: string;
      message: string;
    }
  | {
      kind: "unsupported";
      sourcePaths: string[];
      clipboardFormats: string[];
      strategy: string;
      message: string;
    };
