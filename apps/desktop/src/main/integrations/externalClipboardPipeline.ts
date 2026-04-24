import { runCommandForStdout } from "./process";
import { clipboard } from "electron";
import type { ExternalClipboardReadOutcome } from "../../shared/contracts/rpcRequestTypes";
import { extractPathsFromClipboardText } from "../../shared/fileClipboardPaths";

type ClipboardReadAttemptKind = "success" | "supported" | "empty" | "permission-denied" | "parse-failed";

type ClipboardReadAttempt = {
  kind: ClipboardReadAttemptKind;
  sourcePaths: string[];
  strategy: string;
  message?: string;
};

/** Returns true when one clipboard-read error maps to a permission denial signal. */
function isPermissionDeniedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  return (
    normalizedMessage.includes("not allowed") ||
    normalizedMessage.includes("permission") ||
    normalizedMessage.includes("access denied") ||
    normalizedMessage.includes("operation not permitted")
  );
}

/** Converts one thrown read error into a typed clipboard-read attempt. */
function toClipboardErrorAttempt(strategy: string, error: unknown): ClipboardReadAttempt {
  const fallbackMessage = error instanceof Error ? error.message : String(error);
  if (isPermissionDeniedError(error)) {
    return {
      kind: "permission-denied",
      sourcePaths: [],
      strategy,
      message: fallbackMessage,
    };
  }

  return {
    kind: "parse-failed",
    sourcePaths: [],
    strategy,
    message: fallbackMessage,
  };
}

/** Resolves one typed read attempt from raw clipboard text payload. */
function resolveTextAttempt(textPayload: string, strategy: string): ClipboardReadAttempt {
  const sourcePaths = extractPathsFromClipboardText(textPayload);
  if (sourcePaths.length > 0) {
    return {
      kind: "success",
      sourcePaths,
      strategy,
    };
  }

  const trimmedPayload = textPayload.trim();
  if (!trimmedPayload) {
    return {
      kind: "empty",
      sourcePaths: [],
      strategy,
    };
  }

  return {
    kind: "supported",
    sourcePaths: [],
    strategy,
  };
}

/** Selects one final non-success clipboard outcome after all attempts have completed. */
function resolveFinalFailureAttempt(attempts: ClipboardReadAttempt[]): ClipboardReadAttempt {
  const permissionDeniedAttempt = attempts.find((attempt) => attempt.kind === "permission-denied");
  if (permissionDeniedAttempt) {
    return permissionDeniedAttempt;
  }

  const parseFailedAttempt = attempts.find((attempt) => attempt.kind === "parse-failed");
  if (parseFailedAttempt) {
    return parseFailedAttempt;
  }

  const supportedAttempt = attempts.find((attempt) => attempt.kind === "supported");
  if (supportedAttempt) {
    return supportedAttempt;
  }

  return {
    kind: "empty",
    sourcePaths: [],
    strategy: "none",
  };
}

/** Reads copied file paths from Finder clipboard payloads through AppleScript alias coercion. */
async function readMacOsClipboardFilePathsViaAliases(): Promise<string[]> {
  const scriptOutput = await runCommandForStdout([
    "osascript",
    "-e",
    "try",
    "-e",
    "set copiedItems to the clipboard as alias list",
    "-e",
    'set outputLines to ""',
    "-e",
    "repeat with copiedItem in copiedItems",
    "-e",
    "set outputLines to outputLines & POSIX path of copiedItem & linefeed",
    "-e",
    "end repeat",
    "-e",
    "return outputLines",
    "-e",
    "on error",
    "-e",
    "try",
    "-e",
    "return POSIX path of (the clipboard as alias)",
    "-e",
    "on error",
    "-e",
    'return ""',
    "-e",
    "end try",
    "-e",
    "end try",
  ]);

  return extractPathsFromClipboardText(scriptOutput);
}

/** Reads copied file paths from macOS pasteboard item string payloads through JXA AppKit APIs. */
async function readMacOsClipboardFilePathsViaJxa(): Promise<string[]> {
  const scriptOutput = await runCommandForStdout([
    "osascript",
    "-l",
    "JavaScript",
    "-e",
    'ObjC.import("AppKit"); const pb=$.NSPasteboard.generalPasteboard; const items=pb.pasteboardItems; let output=[]; if (items) { const itemCount=Number(items.count); for (let itemIndex=0; itemIndex<itemCount; itemIndex+=1) { const item=items.objectAtIndex(itemIndex); const types=item.types; const typeCount=Number(types.count); for (let typeIndex=0; typeIndex<typeCount; typeIndex+=1) { const typeObj=types.objectAtIndex(typeIndex); const typeValue=String(ObjC.unwrap(typeObj) ?? ""); const normalized=typeValue.toLowerCase(); if (!(normalized.includes("file-url") || normalized.includes("uri") || normalized.includes("plain-text"))) { continue; } const payload=item.stringForType(typeObj); if (payload) { output.push(String(ObjC.unwrap(payload))); } } } } console.log(output.join("\\n"));',
  ]);

  return extractPathsFromClipboardText(scriptOutput);
}

/** Reads copied file paths from macOS pasteboard through Swift AppKit APIs as a final fallback. */
async function readMacOsClipboardFilePathsViaSwift(): Promise<string[]> {
  const swiftScript = [
    "import AppKit",
    "let pasteboard = NSPasteboard.general",
    "if let urls = pasteboard.readObjects(forClasses: [NSURL.self], options: nil) as? [URL] {",
    "  for url in urls { print(url.path) }",
    "}",
  ].join("\n");

  const scriptOutput = await runCommandForStdout(["/usr/bin/swift", "-e", swiftScript]);
  return extractPathsFromClipboardText(scriptOutput);
}

/** Reads copied file paths from Finder clipboard payloads using multiple macOS extraction strategies. */
async function readMacOsClipboardAttemptChain(): Promise<ClipboardReadAttempt> {
  const macOsReadStrategies: Array<{ name: string; run: () => Promise<string[]> }> = [
    {
      name: "darwin-aliases",
      run: readMacOsClipboardFilePathsViaAliases,
    },
    {
      name: "darwin-jxa",
      run: readMacOsClipboardFilePathsViaJxa,
    },
    {
      name: "darwin-pbpaste",
      run: async () => extractPathsFromClipboardText(await runCommandForStdout(["pbpaste", "-Prefer", "txt"])),
    },
    {
      name: "darwin-swift",
      run: readMacOsClipboardFilePathsViaSwift,
    },
  ];
  const attempts: ClipboardReadAttempt[] = [];

  for (const strategy of macOsReadStrategies) {
    try {
      const sourcePaths = await strategy.run();
      if (sourcePaths.length > 0) {
        return {
          kind: "success",
          sourcePaths,
          strategy: strategy.name,
        };
      }

      attempts.push({
        kind: "supported",
        sourcePaths: [],
        strategy: strategy.name,
      });
    } catch (error) {
      attempts.push(toClipboardErrorAttempt(strategy.name, error));
    }
  }

  return resolveFinalFailureAttempt(attempts);
}

/** Reads copied file paths from Windows FileDropList clipboard format via PowerShell. */
async function readWindowsClipboardAttempt(): Promise<ClipboardReadAttempt> {
  try {
    const scriptOutput = await runCommandForStdout([
      "powershell.exe",
      "-NoProfile",
      "-Command",
      "$paths = Get-Clipboard -Format FileDropList -ErrorAction SilentlyContinue; if ($paths) { ($paths | ForEach-Object { $_ }) -join [Environment]::NewLine }",
    ]);

    return resolveTextAttempt(scriptOutput, "win32-file-drop-list");
  } catch (error) {
    return toClipboardErrorAttempt("win32-file-drop-list", error);
  }
}

/** Reads absolute file paths from system clipboard using native runtime APIs plus OS-specific fallbacks. */
export async function readExternalClipboardSourcePathsFromSystem(): Promise<ExternalClipboardReadOutcome> {
  const clipboardFormats = (() => {
    try {
      return clipboard
        .availableFormats()
        .map((value) => value.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  })();

  const attempts: ClipboardReadAttempt[] = [];

  const textReadAttempt = (() => {
    try {
      return resolveTextAttempt(clipboard.readText(), "electron-clipboard-readText");
    } catch (error) {
      return toClipboardErrorAttempt("electron-clipboard-readText", error);
    }
  })();
  attempts.push(textReadAttempt);
  if (textReadAttempt.kind === "success") {
    return {
      kind: "success",
      sourcePaths: textReadAttempt.sourcePaths,
      clipboardFormats,
      strategy: textReadAttempt.strategy,
    };
  }

  if (process.platform === "darwin") {
    const macOsAttempt = await readMacOsClipboardAttemptChain();
    attempts.push(macOsAttempt);
    if (macOsAttempt.kind === "success") {
      return {
        kind: "success",
        sourcePaths: macOsAttempt.sourcePaths,
        clipboardFormats,
        strategy: macOsAttempt.strategy,
      };
    }
  }

  if (process.platform === "win32") {
    const windowsAttempt = await readWindowsClipboardAttempt();
    attempts.push(windowsAttempt);
    if (windowsAttempt.kind === "success") {
      return {
        kind: "success",
        sourcePaths: windowsAttempt.sourcePaths,
        clipboardFormats,
        strategy: windowsAttempt.strategy,
      };
    }
  }

  if (process.platform !== "darwin" && process.platform !== "win32") {
    return {
      kind: "unsupported",
      sourcePaths: [],
      clipboardFormats,
      strategy: "platform-gate",
      message: `Native external clipboard extraction is not supported on ${process.platform}.`,
    };
  }

  const finalAttempt = resolveFinalFailureAttempt(attempts);
  if (finalAttempt.kind === "permission-denied") {
    return {
      kind: "permission-denied",
      sourcePaths: [],
      clipboardFormats,
      strategy: finalAttempt.strategy,
      message: finalAttempt.message ?? "Clipboard access was denied.",
    };
  }

  if (finalAttempt.kind === "parse-failed") {
    return {
      kind: "parse-failed",
      sourcePaths: [],
      clipboardFormats,
      strategy: finalAttempt.strategy,
      message: finalAttempt.message ?? "Clipboard content could not be parsed.",
    };
  }

  if (finalAttempt.kind === "supported") {
    return {
      kind: "supported",
      sourcePaths: [],
      clipboardFormats,
      strategy: finalAttempt.strategy,
    };
  }

  return {
    kind: "empty",
    sourcePaths: [],
    clipboardFormats,
    strategy: finalAttempt.strategy,
  };
}
