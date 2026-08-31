import { getErrorMessage } from "../../../../shared/errors/getErrorMessage";
import type { AgentMessage } from "../chat/agentChatTypes";
import type { AgentDSHAttachResult, AgentDSHHistory } from "../daemon/daemonAgentTypes";
import {
  type DSHEvent,
  type DSHFrontendPayload,
  type DSHUpdate,
  isUnknownRequiredDSHEvent,
  parseDSHFrontendPayload,
  projectDSHTranscript,
} from "./dshTranscript";

/** Bounds recovery memory while allowing normal DSH initial transcript replays. */
const MAX_BUFFERED_UPDATES = 4_096;

/** Store mutations used by the DSH controller; I/O is intentionally injected. */
export type DSHTranscriptActions = {
  replaceMessages(tabId: string, messages: AgentMessage[]): void;
  updateStreamingMessage(tabId: string, message: AgentMessage): void;
  clearStreamingMessage(tabId: string): void;
  setSessionState(tabId: string, state: "starting" | "running" | "compacting" | "idle" | "error"): void;
  setSessionError(tabId: string, error: string): void;
  setTurnError(tabId: string, error: string): void;
  clearTurnError(tabId: string): void;
  setDSHTranscriptRetryAvailable(tabId: string, available: boolean): void;
  setTurnActive(tabId: string, active: boolean): void;
};

/** The last daemon-confirmed DSH event position. */
export type DSHDurableCursor = { sessionId: string; instanceId: string; durableThroughSeq: number };

/** Maintains one tab's contiguous DSH event stream and durable/speculative boundary. */
export class DSHTranscriptController {
  private instanceId = "";
  private nextSeq = 0;
  private durableThroughSeq = -1;
  private events: DSHEvent[] = [];
  private activeTextStream: { key: string; text: string } | null = null;
  private isBlocked = false;
  private controllerState: "normal" | "recovering" | "failed" = "normal";
  private recoveryInstanceId = "";
  private recoveryReplayThroughSeq: number | null = null;
  private recoveryGeneration = 0;
  private recoveryPromise: Promise<void> | null = null;
  private isReplayingBufferedUpdates = false;
  private isProjectionScheduled = false;
  private projectionGeneration = 0;
  private isAwaitingAttachSnapshot: boolean;
  private bufferedUpdates: Array<{ instanceId: string; update: DSHUpdate }> = [];

  public constructor(
    private readonly tabId: string,
    private readonly sessionId: string,
    private readonly actions: DSHTranscriptActions,
    private readonly loadDurableSnapshot: () => Promise<AgentDSHHistory>,
    private readonly onDurableCursor: (cursor: DSHDurableCursor) => void,
    private readonly attachSnapshotInstanceId: (
      cursor: DSHDurableCursor,
    ) => Promise<AgentDSHAttachResult | undefined> = async () => undefined,
    isAwaitingAttachSnapshot = false,
  ) {
    this.isAwaitingAttachSnapshot = isAwaitingAttachSnapshot;
  }

  public getDurableThroughSeq(): number {
    return this.durableThroughSeq;
  }

  public applyAttachSnapshot(snapshot: AgentDSHAttachResult): void {
    try {
      const events = this.parseAttachEvents(snapshot);
      const hasNewInstanceId = !this.instanceId || this.instanceId !== snapshot.instanceId;
      if (hasNewInstanceId) this.replaceAttachState(snapshot.instanceId);
      if (this.instanceId !== snapshot.instanceId) throw new TypeError("DSH attach instance ID mismatch");
      this.reconcileAttachEvents(events);
      this.projectEvents();
      this.replayBufferedUpdates();
      if (this.controllerState === "failed" || this.isBlocked) {
        throw new TypeError("DSH attach event could not be applied");
      }
      if (snapshot.durableThroughSeq > this.nextSeq - 1) {
        throw new TypeError("DSH attach durable cursor exceeds transcript");
      }
      if (snapshot.durableThroughSeq > this.durableThroughSeq) {
        this.durableThroughSeq = snapshot.durableThroughSeq;
        this.onDurableCursor({
          sessionId: this.sessionId,
          instanceId: snapshot.instanceId,
          durableThroughSeq: snapshot.durableThroughSeq,
        });
      }
    } catch (error) {
      if (this.controllerState !== "recovering") {
        this.markBlocked(`DSH attach snapshot failed: ${getErrorMessage(error)}`);
      }
      throw error;
    }
  }

  private replayBufferedUpdates(): void {
    const bufferedUpdates = this.bufferedUpdates;
    this.bufferedUpdates = [];
    this.isAwaitingAttachSnapshot = false;
    for (const bufferedUpdate of bufferedUpdates)
      this.handle({
        sessionId: this.sessionId,
        tabId: this.tabId,
        workspaceId: "start-replay",
        instanceId: bufferedUpdate.instanceId,
        update: bufferedUpdate.update,
      });
  }

  /** Retries a failed DSH durable reload without changing runtimes. */
  public async retry(): Promise<void> {
    if (this.isBlocked || this.controllerState !== "failed" || !this.recoveryInstanceId) return;
    this.startRecovery(this.recoveryInstanceId, true);
    await this.recoveryPromise;
  }

  /** Starts a durable reload after the router identifies a malformed notification for this tab/session. */
  public handleMalformedPayload(): void {
    if (!this.isBlocked && this.controllerState !== "failed") this.startRecovery(this.instanceId);
  }

  /** Applies a validated notification. */
  public handle(payload: DSHFrontendPayload): void {
    if (payload.tabId !== this.tabId || payload.sessionId !== this.sessionId || this.isBlocked) return;
    if (this.isAwaitingAttachSnapshot) {
      this.bufferUpdate(payload.instanceId, payload.update);
      return;
    }
    if (payload.update.reset) {
      this.startRecovery(payload.update.reset.instanceId, false, payload.update.reset.headSeq);
      return;
    }
    if (this.controllerState === "recovering") {
      if (payload.instanceId !== this.recoveryInstanceId) this.startRecovery(payload.instanceId);
      if (!payload.update.reset) this.bufferUpdate(payload.instanceId, payload.update);
      return;
    }
    if (this.controllerState === "failed") {
      if (payload.instanceId !== this.recoveryInstanceId) {
        this.startRecovery(payload.instanceId);
        if (!payload.update.reset) this.bufferUpdate(payload.instanceId, payload.update);
      } else if (!payload.update.reset) {
        this.bufferUpdate(payload.instanceId, payload.update);
      }
      return;
    }
    if (this.instanceId && payload.instanceId !== this.instanceId) {
      this.startRecovery(payload.instanceId);
      if (!payload.update.reset) this.bufferUpdate(payload.instanceId, payload.update);
      return;
    }
    this.instanceId ||= payload.instanceId;
    this.applyUpdate(payload.update);
  }

  private parseAttachEvents(snapshot: AgentDSHAttachResult): DSHEvent[] {
    if (
      snapshot.runtime !== "dsh" ||
      snapshot.sessionId !== this.sessionId ||
      !snapshot.instanceId ||
      !this.isSafeSequence(snapshot.asOfSeq, -1) ||
      !this.isSafeSequence(snapshot.durableThroughSeq, -1) ||
      !this.isSafeSequence(snapshot.headSeq, -1) ||
      snapshot.asOfSeq !== snapshot.durableThroughSeq ||
      snapshot.headSeq < snapshot.durableThroughSeq
    ) {
      throw new TypeError("DSH attach snapshot metadata is invalid");
    }
    const events = snapshot.events.map((event) => {
      const sequence = this.getAttachEventSequence(event);
      const payload = parseDSHFrontendPayload({
        sessionId: this.sessionId,
        tabId: this.tabId,
        workspaceId: "attach-snapshot",
        instanceId: snapshot.instanceId,
        update: { event: { sessionId: this.sessionId, seq: sequence, event } },
      });
      if (!payload?.update.event || isUnknownRequiredDSHEvent(payload.update.event)) {
        throw new TypeError("DSH attach event is invalid");
      }
      return payload.update.event;
    });
    const firstSequence = events[0]?.seq;
    if (firstSequence !== undefined && events.some((event, index) => event.seq !== firstSequence + index)) {
      throw new TypeError("DSH attach events are not contiguous");
    }
    if (events.length === 0 && snapshot.headSeq !== snapshot.asOfSeq) {
      throw new TypeError("DSH attach head does not match events");
    }
    if (
      events.length > 0 &&
      (events.at(-1)?.seq !== snapshot.headSeq || firstSequence === undefined || firstSequence > snapshot.asOfSeq + 1)
    ) {
      throw new TypeError("DSH attach head does not match events");
    }
    return events;
  }

  private reconcileAttachEvents(events: DSHEvent[]): void {
    for (const event of events) {
      if (event.seq < this.nextSeq) {
        const prior = this.events[event.seq];
        if (!prior || JSON.stringify(prior) !== JSON.stringify(event)) {
          throw new TypeError("DSH attach event conflicts with transcript");
        }
        continue;
      }
      if (event.seq > this.nextSeq) throw new TypeError("DSH attach snapshot has a transcript gap");
      this.applyEvent(event, false);
      if (this.controllerState === "failed" || this.isBlocked) {
        throw new TypeError("DSH attach event could not be applied");
      }
    }
  }

  private isSafeSequence(sequence: number, minimum: number): boolean {
    return Number.isSafeInteger(sequence) && sequence >= minimum;
  }

  private getAttachEventSequence(event: unknown): number {
    if (typeof event !== "object" || event === null || !("seq" in event)) {
      throw new TypeError("DSH attach event sequence is missing");
    }
    const { seq } = event;
    if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0) {
      throw new TypeError("DSH attach event sequence is invalid");
    }
    return seq;
  }

  private replaceAttachState(instanceId: string): void {
    this.instanceId = instanceId;
    this.nextSeq = 0;
    this.durableThroughSeq = -1;
    this.events = [];
    this.clearActiveTextStream();
  }

  private applyUpdate(update: DSHUpdate): void {
    if (update.reset) {
      this.startRecovery(update.reset.instanceId, false, update.reset.headSeq);
      return;
    }
    if (update.cursor) this.applyCursor(update.cursor);
    if (update.status) this.applyStatus(update.status.status);
    if (update.unavailable) this.startRecovery(this.instanceId);
    if (update.event) this.applyEvent(update.event);
  }

  private applyCursor(cursor: DSHDurableCursor): void {
    if (
      cursor.instanceId !== this.instanceId ||
      cursor.durableThroughSeq < this.durableThroughSeq ||
      cursor.durableThroughSeq >= this.nextSeq
    ) {
      this.startRecovery(this.instanceId);
      return;
    }
    if (cursor.durableThroughSeq === this.durableThroughSeq) return;
    this.durableThroughSeq = cursor.durableThroughSeq;
    this.onDurableCursor(cursor);
  }

  private applyEvent(event: DSHEvent, shouldProject = true): void {
    if (isUnknownRequiredDSHEvent(event)) {
      this.startRecovery(this.instanceId);
      return;
    }
    if (event.seq < this.nextSeq) {
      const prior = this.events[event.seq];
      if (prior && JSON.stringify(prior) === JSON.stringify(event)) return;
      this.startRecovery(this.instanceId);
      if (!this.isReplayingBufferedUpdates) this.bufferUpdate(this.instanceId, { event });
      return;
    }
    if (event.seq !== this.nextSeq) {
      this.startRecovery(this.instanceId);
      if (!this.isReplayingBufferedUpdates) this.bufferUpdate(this.instanceId, { event });
      return;
    }
    this.events.push(event);
    this.nextSeq++;
    if (event.type === "turn/start") {
      this.clearActiveTextStream();
      this.actions.clearTurnError(this.tabId);
    }
    if (event.type === "turn/end") {
      this.clearActiveTextStream();
      const reason =
        typeof event.data.reason === "object" && event.data.reason !== null
          ? (event.data.reason as Record<string, unknown>)
          : null;
      if (reason?.kind === "error") {
        const error =
          typeof reason.error === "object" && reason.error !== null ? (reason.error as Record<string, unknown>) : null;
        const message = typeof error?.message === "string" ? error.message : "Agent turn failed";
        this.actions.setTurnError(this.tabId, message);
      }
    }
    if (event.type === "assistant/message") this.clearActiveTextStreamFor(event);
    if (shouldProject) this.scheduleProjection();
    if (event.type === "assistant/chunk") this.applyChunk(event);
  }

  private startRecovery(
    instanceId: string,
    preserveBufferedUpdates = false,
    replayThroughSeq: number | null = null,
  ): void {
    if (this.isBlocked) return;
    if (this.controllerState === "recovering" && instanceId === this.recoveryInstanceId) {
      if (replayThroughSeq !== null) this.recoveryReplayThroughSeq = replayThroughSeq;
      return;
    }
    this.discardSpeculativeEvents();
    this.controllerState = "recovering";
    this.recoveryInstanceId = instanceId;
    this.recoveryReplayThroughSeq = replayThroughSeq;
    this.recoveryGeneration++;
    if (!preserveBufferedUpdates) this.bufferedUpdates = [];
    this.actions.setDSHTranscriptRetryAvailable(this.tabId, false);
    this.actions.setTurnActive(this.tabId, false);
    this.actions.setSessionState(this.tabId, "starting");
    this.recoveryPromise = this.loadAndReplay(instanceId, this.recoveryGeneration);
    // fire-and-forget: incoming daemon notifications must not await durable I/O.
    void this.recoveryPromise.catch(() => undefined);
  }

  private discardSpeculativeEvents(): void {
    this.events = this.events.slice(0, this.durableThroughSeq + 1);
    this.nextSeq = this.events.length;
    this.clearActiveTextStream();
    this.projectEvents();
  }

  private bufferUpdate(instanceId: string, update: DSHUpdate): void {
    if (update.event && this.recoveryReplayThroughSeq !== null && update.event.seq <= this.recoveryReplayThroughSeq) {
      return;
    }
    if (this.bufferedUpdates.length >= MAX_BUFFERED_UPDATES) {
      this.markBlocked("DSH transcript reload buffer overflow");
      return;
    }
    this.bufferedUpdates.push({ instanceId, update });
  }

  private async loadAndReplay(instanceId: string, generation: number): Promise<void> {
    try {
      const snapshot = await this.loadDurableSnapshot();
      if (this.controllerState !== "recovering" || generation !== this.recoveryGeneration) return;
      const events = this.validateSnapshot(snapshot);
      const hasNewInstanceId = snapshot.instanceId !== instanceId;
      // The validated durable snapshot supersedes the reset target. Replay
      // notifications from the subsequent attach must be buffered under it.
      if (hasNewInstanceId) this.recoveryInstanceId = snapshot.instanceId;
      this.instanceId = snapshot.instanceId;
      this.events = events;
      this.nextSeq = events.length;
      this.durableThroughSeq = snapshot.durableThroughSeq;
      this.clearActiveTextStream();
      this.projectEvents();
      const cursor = {
        sessionId: this.sessionId,
        instanceId: this.instanceId,
        durableThroughSeq: this.durableThroughSeq,
      };
      this.onDurableCursor(cursor);
      const attachSnapshot = await this.attachSnapshotInstanceId(cursor);
      if (attachSnapshot) this.applyAttachSnapshot(attachSnapshot);
      const bufferedUpdates = this.bufferedUpdates;
      this.bufferedUpdates = [];
      this.recoveryReplayThroughSeq = null;
      this.controllerState = "normal";
      this.actions.setDSHTranscriptRetryAvailable(this.tabId, false);
      this.isReplayingBufferedUpdates = true;
      try {
        for (const bufferedUpdate of bufferedUpdates) {
          if (this.isBlocked || this.controllerState !== "normal") break;
          if (bufferedUpdate.instanceId === this.recoveryInstanceId) this.applyUpdate(bufferedUpdate.update);
        }
      } finally {
        this.isReplayingBufferedUpdates = false;
      }
    } catch (error) {
      if (generation !== this.recoveryGeneration) return;
      this.controllerState = "failed";
      this.actions.setDSHTranscriptRetryAvailable(this.tabId, true);
      this.actions.setTurnActive(this.tabId, false);
      this.actions.setSessionState(this.tabId, "error");
      this.actions.setSessionError(this.tabId, `DSH durable reload failed: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  private validateSnapshot(snapshot: AgentDSHHistory): DSHEvent[] {
    if (snapshot.session.sessionId !== this.sessionId) throw new TypeError("DSH durable history session mismatch");
    if (!snapshot.instanceId || snapshot.asOfSeq !== snapshot.durableThroughSeq)
      throw new TypeError("DSH durable history cursor mismatch");
    if (snapshot.events.length !== snapshot.durableThroughSeq + 1)
      throw new TypeError("DSH durable history is not contiguous");
    return snapshot.events.map((event, seq) => {
      const payload = parseDSHFrontendPayload({
        sessionId: this.sessionId,
        tabId: this.tabId,
        workspaceId: "durable-history",
        instanceId: snapshot.instanceId,
        update: { event: { sessionId: this.sessionId, seq, event } },
      });
      if (!payload?.update.event) throw new TypeError("DSH durable history event is invalid");
      return payload.update.event;
    });
  }

  private scheduleProjection(): void {
    if (this.isProjectionScheduled) return;
    this.isProjectionScheduled = true;
    const generation = this.projectionGeneration;
    queueMicrotask(() => {
      this.isProjectionScheduled = false;
      if (!this.isBlocked && generation === this.projectionGeneration) this.projectEvents();
    });
  }

  private projectEvents(): void {
    this.projectionGeneration++;
    try {
      this.actions.replaceMessages(this.tabId, projectDSHTranscript(this.events));
    } catch (error) {
      this.markBlocked(`DSH transcript projection failed: ${getErrorMessage(error)}`);
    }
  }

  private applyChunk(event: DSHEvent): void {
    const chunk = event.data.chunk;
    const streamKey = this.getStreamKey(event);
    if (!chunk || typeof chunk !== "object" || Array.isArray(chunk) || !streamKey) return;
    const record = chunk as Record<string, unknown>;
    if (record.type !== "text-delta" || typeof record.text !== "string") return;
    this.activeTextStream =
      this.activeTextStream?.key === streamKey
        ? { key: streamKey, text: `${this.activeTextStream.text}${record.text}` }
        : { key: streamKey, text: record.text };
    this.actions.updateStreamingMessage(this.tabId, {
      id: `dsh-stream-${streamKey}`,
      role: "assistant",
      content: [{ type: "text", text: this.activeTextStream.text }],
      timestamp: event.time,
    });
  }

  private clearActiveTextStreamFor(event: DSHEvent): void {
    if (this.activeTextStream?.key === this.getStreamKey(event)) this.clearActiveTextStream();
  }

  private clearActiveTextStream(): void {
    this.activeTextStream = null;
    this.actions.clearStreamingMessage(this.tabId);
  }

  private getStreamKey(event: DSHEvent): string | null {
    const { step, turn } = event.data;
    return typeof turn === "number" &&
      Number.isSafeInteger(turn) &&
      turn >= 0 &&
      typeof step === "number" &&
      Number.isSafeInteger(step) &&
      step >= 0
      ? `${turn}:${step}`
      : null;
  }

  private applyStatus(status: string): void {
    if (status === "running") {
      this.actions.setSessionState(this.tabId, "running");
      this.actions.setTurnActive(this.tabId, true);
    } else if (status === "idle") {
      this.actions.setSessionState(this.tabId, "idle");
      this.actions.setTurnActive(this.tabId, false);
    }
  }

  private markBlocked(error: string): void {
    this.isBlocked = true;
    this.controllerState = "failed";
    this.bufferedUpdates = [];
    this.events = [];
    this.clearActiveTextStream();
    this.nextSeq = 0;
    this.durableThroughSeq = -1;
    this.actions.replaceMessages(this.tabId, []);
    this.actions.setDSHTranscriptRetryAvailable(this.tabId, false);
    this.actions.setTurnActive(this.tabId, false);
    this.actions.setSessionState(this.tabId, "error");
    this.actions.setSessionError(this.tabId, error);
  }
}
