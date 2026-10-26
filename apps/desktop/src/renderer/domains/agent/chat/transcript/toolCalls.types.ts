/** Exact, session-scoped tool identity supplied by the caller. */
export type ToolCallIdentity = { readonly sessionId: string; readonly callId: string };

/**
 * Explicit authority: final beats partial, then higher priority, then lexical source ID.
 * IDs identify immutable facts; a changed fact must supply a new ID or authority.
 * Origin is provenance only and does not imply authority or execution.
 */
export type ToolCallSource = {
  readonly id: string;
  readonly origin: "live" | "snapshot";
  readonly isFinal: boolean;
  readonly priority: number;
};

/** Available result content only; no implied full-text reference or execution outcome. */
export type ToolResultContent =
  | { readonly availability: "missing" }
  | {
      readonly availability: "available";
      readonly completeness: "unknown" | "partial" | "complete";
      readonly text?: string;
      readonly details?: Readonly<Record<string, unknown>>;
    };

/** Owner metadata, not a protocol message or an execution assertion. */
export type ToolCallOwner = {
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly source: ToolCallSource;
};

/** Explicit execution state; absent evidence remains unknown. */
export type ToolExecutionState = "unknown" | "pending" | "running" | "succeeded" | "failed" | "interrupted";

/** Explicit terminal outcome, independent of content completeness. */
export type ToolOutcome = "succeeded" | "failed" | "interrupted";

/** Runtime execution evidence with caller-supplied authority. */
export type ToolExecutionFact = { readonly state: ToolExecutionState; readonly source: ToolCallSource };

/** Dispatch evidence retains its own authority independently of selected result content. */
export type ToolDispatchFact = { readonly state: "accepted" | "failed"; readonly source: ToolCallSource };

/** One normalized result fact. */
export type ToolCallResult = {
  readonly content: ToolResultContent;
  readonly source: ToolCallSource;
  readonly outcome?: ToolOutcome;
  readonly dispatch?: "accepted" | "failed";
};

/** Exact child lifecycle fact; completion without an outcome remains unknown. */
export type ToolChildFact = {
  readonly childSessionId: string;
  readonly event: "started" | "completed";
  readonly outcome?: ToolOutcome;
  readonly source: ToolCallSource;
};

/** Child execution is separate from parent dispatch execution. */
export type ToolChildState = ToolChildFact & {
  readonly state: ToolExecutionState;
  readonly isComplete: boolean;
};

/** Bounded competing-result provenance, not a retained result archive. */
export type ToolCallDiagnostic = {
  readonly code: "competingResults";
  readonly sourceIds: readonly string[];
  readonly hasMoreSources: boolean;
};

/** Caller-owned call entity, including unresolved result-first calls. */
export type ToolCallEntity = ToolCallIdentity & {
  readonly executionState: ToolExecutionState;
  readonly execution?: ToolExecutionFact;
  readonly dispatch?: ToolDispatchFact;
  readonly dispatchState?: "unknown" | "accepted" | "failed";
  readonly children?: ReadonlyMap<string, ToolChildState>;
  readonly diagnostics?: readonly ToolCallDiagnostic[];
  readonly owner?: ToolCallOwner;
  readonly result?: ToolCallResult;
};

/** Immutable session and call maps avoid delimiter and prototype-key collisions. */
export type ToolCallsState = ReadonlyMap<string, ReadonlyMap<string, ToolCallEntity>>;

/** Normalized facts; exact identity and authority are supplied, never inferred. */
export type ToolCallOperation = ToolCallIdentity &
  (
    | { readonly type: "owner"; readonly owner: ToolCallOwner }
    | { readonly type: "result"; readonly result: ToolCallResult }
    | { readonly type: "execution"; readonly execution: ToolExecutionFact }
    | { readonly type: "child"; readonly child: ToolChildFact }
  );
