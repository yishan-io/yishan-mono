/** Daemon-authorized identity required for one capability request. */
export interface CapabilityIdentity {
  sessionId: string;
  workspaceId: string;
  generation: number;
}

/** A capability request sent over the daemon bridge. */
export interface CapabilityRequest<TOperation extends string, TInput> extends CapabilityIdentity {
  id: string;
  cancellationId: string;
  signal: AbortSignal;
  deadlineAtMs: number;
  operation: TOperation;
  input: TInput;
}

/** Narrow daemon transport used exclusively for daemon capability requests. */
export interface CapabilityTransport<TRequest> {
  requestCapability(request: TRequest): Promise<unknown>;
}

const CAPABILITY_REQUEST_LIFETIME_MS = 60_000;
let nextCapabilityRequestId = 0;

/** Constructs authorized, cancellable requests for one daemon capability. */
export class CapabilityClient<TOperation extends string, TInput> {
  constructor(
    private readonly transport: CapabilityTransport<CapabilityRequest<TOperation, TInput>>,
    private readonly identity: CapabilityIdentity,
    private readonly signal: AbortSignal,
    private readonly requestIdPrefix = "capability",
  ) {}

  /** Sends one bounded request through the capability transport. */
  async request<TResult>(operation: TOperation, input: TInput): Promise<TResult> {
    if (this.signal.aborted) throw this.signal.reason;
    const id = createCapabilityRequestId(this.requestIdPrefix);
    return (await this.transport.requestCapability({
      ...this.identity,
      id,
      cancellationId: createCapabilityRequestId(this.requestIdPrefix),
      signal: this.signal,
      deadlineAtMs: Date.now() + CAPABILITY_REQUEST_LIFETIME_MS,
      operation,
      input,
    })) as TResult;
  }
}

function createCapabilityRequestId(prefix: string): string {
  nextCapabilityRequestId += 1;
  return `${prefix}-${Date.now()}-${nextCapabilityRequestId}`;
}
