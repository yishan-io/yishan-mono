export type FileTreeClipboardState = {
  requestId: number;
  mode: "copy" | "move";
  sourcePaths: string[];
  externalClipboardSnapshotSourcePaths: string[] | null;
};

export type ClipboardFilePayload = {
  relativePath: string;
  contentBase64: string;
};

export type ResolvedClipboardSource =
  | {
      kind: "internal";
      mode: "copy" | "move";
      sourcePaths: string[];
    }
  | {
      kind: "external-paths";
      sourcePaths: string[];
    }
  | {
      kind: "external-file-payloads";
      filePayloads: ClipboardFilePayload[];
    };

export type ClipboardSourceResolverContext = {
  clipboardState: FileTreeClipboardState | null;
  externalSourcePaths: string[];
  externalFilePayloads: ClipboardFilePayload[];
};

/** Resolves one clipboard source candidate from the current paste context, or null when not applicable. */
export type ClipboardSourceResolver = (context: ClipboardSourceResolverContext) => ResolvedClipboardSource | null;

/** Returns true when two path lists contain the same normalized entries regardless of order. */
function arePathSetsEqual(leftPaths: string[], rightPaths: string[]): boolean {
  const normalize = (path: string): string => path.trim().replace(/\\/g, "/");
  const leftSet = new Set(leftPaths.map((path) => normalize(path)).filter(Boolean));
  const rightSet = new Set(rightPaths.map((path) => normalize(path)).filter(Boolean));

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  for (const leftPath of leftSet) {
    if (!rightSet.has(leftPath)) {
      return false;
    }
  }

  return true;
}

/** Picks internal move clipboard first so cut/paste behavior is deterministic and not overridden by external clipboard. */
function resolveInternalMoveClipboardSource(context: ClipboardSourceResolverContext): ResolvedClipboardSource | null {
  if (!context.clipboardState || context.clipboardState.mode !== "move") {
    return null;
  }

  if (context.clipboardState.sourcePaths.length === 0) {
    return null;
  }

  return {
    kind: "internal",
    mode: "move",
    sourcePaths: context.clipboardState.sourcePaths,
  };
}

/** Picks external file-manager paths when they should override an internal copy snapshot. */
function resolveExternalPathClipboardSource(context: ClipboardSourceResolverContext): ResolvedClipboardSource | null {
  if (context.externalSourcePaths.length === 0) {
    return null;
  }

  if (!context.clipboardState) {
    return {
      kind: "external-paths",
      sourcePaths: context.externalSourcePaths,
    };
  }

  if (context.clipboardState.mode !== "copy") {
    return null;
  }

  const snapshot = context.clipboardState.externalClipboardSnapshotSourcePaths;
  if (!snapshot) {
    return null;
  }

  if (arePathSetsEqual(context.externalSourcePaths, snapshot)) {
    return null;
  }

  return {
    kind: "external-paths",
    sourcePaths: context.externalSourcePaths,
  };
}

/** Picks external clipboard file payloads only when no internal clipboard state exists. */
function resolveExternalFilePayloadClipboardSource(
  context: ClipboardSourceResolverContext,
): ResolvedClipboardSource | null {
  if (context.externalFilePayloads.length === 0) {
    return null;
  }

  if (context.clipboardState) {
    return null;
  }

  return {
    kind: "external-file-payloads",
    filePayloads: context.externalFilePayloads,
  };
}

/** Falls back to internal copy clipboard state after external candidates are considered. */
function resolveInternalCopyClipboardSource(context: ClipboardSourceResolverContext): ResolvedClipboardSource | null {
  if (!context.clipboardState || context.clipboardState.mode !== "copy") {
    return null;
  }

  if (context.clipboardState.sourcePaths.length === 0) {
    return null;
  }

  return {
    kind: "internal",
    mode: "copy",
    sourcePaths: context.clipboardState.sourcePaths,
  };
}

/** Registry of clipboard source resolvers applied in deterministic order for paste orchestration. */
export const DEFAULT_CLIPBOARD_SOURCE_RESOLVERS: readonly ClipboardSourceResolver[] = [
  resolveInternalMoveClipboardSource,
  resolveExternalPathClipboardSource,
  resolveExternalFilePayloadClipboardSource,
  resolveInternalCopyClipboardSource,
];

/** Resolves the first applicable clipboard source from a resolver chain. */
export function resolveClipboardSource(
  context: ClipboardSourceResolverContext,
  resolvers: readonly ClipboardSourceResolver[] = DEFAULT_CLIPBOARD_SOURCE_RESOLVERS,
): ResolvedClipboardSource | null {
  for (const resolver of resolvers) {
    const resolvedSource = resolver(context);
    if (resolvedSource) {
      return resolvedSource;
    }
  }

  return null;
}
