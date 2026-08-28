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

const MAX_BUFFERED_UPDATES = 128;

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
export type DSHDurableCursor = { sessionId: string; incarnation: string; durableThroughSeq: number };

/** Maintains one tab's contiguous DSH event stream and durable/speculative boundary. */
export class DSHTranscriptController {
  private incarnation = "";
  private nextSeq = 0;
  private durableThroughSeq = -1;
  private events: DSHEvent[] = [];
  private activeTextStream: { key: string; text: string } | null = null;
  private isBlocked = false;
  private controllerState: "normal" | "recovering" | "failed" = "normal";
  private recoveryIncarnation = "";
  private recoveryReplayThroughSeq: number | null = null;
  private recoveryGeneration = 0;
  private recoveryPromise: Promise<void> | null = null;
  private isReplayingBufferedUpdates = false;
  private bufferedUpdates: Array<{ incarnation: string; update: DSHUpdate }> = [];

  public constructor(
    private readonly tabId: string,
    private readonly sessionId: string,
    private readonly actions: DSHTranscriptActions,
    private readonly loadDurableSnapshot: () => Promise<AgentDSHHistory>,
    private readonly onDurableCursor: (cursor: DSHDurableCursor) => void,
    private readonly attachSnapshotIncarnation: (
      cursor: DSHDurableCursor,
    ) => Promise<AgentDSHAttachResult | undefined> = async () => undefined,
  ) {}

  /** Returns the sequence that may safely be used as an attach replay cursor. */
  public getDurableThroughSeq(): number {
    return this.durableThroughSeq;
  }

  /** Strictly validates and applies the authoritative DSH attach snapshot. */
  public applyAttachSnapshot(snapshot: AgentDSHAttachResult): void {
    try {
      const events = this.parseAttachEvents(snapshot);
      const hasNewIncarnation = !this.incarnation || this.incarnation !== snapshot.incarnation;
      if (hasNewIncarnation) this.replaceAttachState(snapshot.incarnation);
      if (this.incarnation !== snapshot.incarnation) throw new TypeError("DSH attach incarnation mismatch");
      this.reconcileAttachEvents(events);
      if (snapshot.durableThroughSeq > this.nextSeq - 1) {
        throw new TypeError("DSH attach durable cursor exceeds transcript");
      }
      if (snapshot.durableThroughSeq > this.durableThroughSeq) {
        this.durableThroughSeq = snapshot.durableThroughSeq;
        this.onDurableCursor({
          sessionId: this.sessionId,
          incarnation: snapshot.incarnation,
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

  /** Retries a failed DSH durable reload without changing runtimes. */
  public async retry(): Promise<void> {
    if (this.isBlocked || this.controllerState !== "failed" || !this.recoveryIncarnation) return;
    this.startRecovery(this.recoveryIncarnation, true);
    await this.recoveryPromise;
  }

  /** Starts a durable reload after the router identifies a malformed notification for this tab/session. */
  public handleMalformedPayload(): void {
    if (!this.isBlocked && this.controllerState !== "failed") this.startRecovery(this.incarnation);
  }

  /** Applies a validated notification. */
  public handle(payload: DSHFrontendPayload): void {
    if (payload.tabId !== this.tabId || payload.sessionId !== this.sessionId || this.isBlocked) return;
    if (payload.update.reset) {
      this.startRecovery(payload.update.reset.incarnation, false, payload.update.reset.headSeq);
      return;
    }
    if (this.controllerState === "recovering") {
      if (payload.incarnation !== this.recoveryIncarnation) this.startRecovery(payload.incarnation);
      if (!payload.update.reset) this.bufferUpdate(payload.incarnation, payload.update);
      return;
    }
    if (this.controllerState === "failed") {
      if (payload.incarnation !== this.recoveryIncarnation) {
        this.startRecovery(payload.incarnation);
        if (!payload.update.reset) this.bufferUpdate(payload.incarnation, payload.update);
      } else if (!payload.update.reset) {
        this.bufferUpdate(payload.incarnation, payload.update);
      }
      return;
    }
    if (this.incarnation && payload.incarnation !== this.incarnation) {
      this.startRecovery(payload.incarnation);
      if (!payload.update.reset) this.bufferUpdate(payload.incarnation, payload.update);
      return;
    }
    this.incarnation ||= payload.incarnation;
    this.applyUpdate(payload.update);
  }

  private parseAttachEvents(snapshot: AgentDSHAttachResult): DSHEvent[] {
    if (
      snapshot.runtime !== "dsh" ||
      snapshot.sessionId !== this.sessionId ||
      !snapshot.incarnation ||
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
        incarnation: snapshot.incarnation,
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
      this.applyEvent(event);
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

  private replaceAttachState(incarnation: string): void {
    this.incarnation = incarnation;
    this.nextSeq = 0;
    this.durableThroughSeq = -1;
    this.events = [];
    this.clearActiveTextStream();
  }

  private applyUpdate(update: DSHUpdate): void {
    if (update.reset) {
      this.startRecovery(update.reset.incarnation, false, update.reset.headSeq);
      return;
    }
    if (update.cursor) this.applyCursor(update.cursor);
    if (update.status) this.applyStatus(update.status.status);
    if (update.unavailable) this.startRecovery(this.incarnation);
    if (update.event) this.applyEvent(update.event);
  }

  private applyCursor(cursor: DSHDurableCursor): void {
    if (
      cursor.incarnation !== this.incarnation ||
      cursor.durableThroughSeq < this.durableThroughSeq ||
      cursor.durableThroughSeq >= this.nextSeq
    ) {
      this.startRecovery(this.incarnation);
      return;
    }
    if (cursor.durableThroughSeq === this.durableThroughSeq) return;
    this.durableThroughSeq = cursor.durableThroughSeq;
    this.onDurableCursor(cursor);
  }

  private applyEvent(event: DSHEvent): void {
    if (isUnknownRequiredDSHEvent(event)) {
      this.startRecovery(this.incarnation);
      return;
    }
    if (event.seq < this.nextSeq) {
      const prior = this.events[event.seq];
      if (prior && JSON.stringify(prior) === JSON.stringify(event)) return;
      this.startRecovery(this.incarnation);
      if (!this.isReplayingBufferedUpdates) this.bufferUpdate(this.incarnation, { event });
      return;
    }
    if (event.seq !== this.nextSeq) {
      this.startRecovery(this.incarnation);
      if (!this.isReplayingBufferedUpdates) this.bufferUpdate(this.incarnation, { event });
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
      const reason = typeof event.data.reason === "object" && event.data.reason !== null ? event.data.reason as Record<string, unknown> : null;
      if (reason?.kind === "error") {
        const error = typeof reason.error === "object" && reason.error !== null ? reason.error as Record<string, unknown> : null;
        const message = typeof error?.message === "string" ? error.message : "Agent turn failed";
        this.actions.setTurnError(this.tabId, message);
      }
    }
    if (event.type === "assistant/message") this.clearActiveTextStreamFor(event);
    this.projectEvents();
    if (event.type === "assistant/chunk") this.applyChunk(event);
  }

  private startRecovery(
    incarnation: string,
    preserveBufferedUpdates = false,
    replayThroughSeq: number | null = null,
  ): void {
    if (this.isBlocked) return;
    if (this.controllerState === "recovering" && incarnation === this.recoveryIncarnation) {
      if (replayThroughSeq !== null) this.recoveryReplayThroughSeq = replayThroughSeq;
      return;
    }
    this.discardSpeculativeEvents();
    this.controllerState = "recovering";
    this.recoveryIncarnation = incarnation;
    this.recoveryReplayThroughSeq = replayThroughSeq;
    this.recoveryGeneration++;
    if (!preserveBufferedUpdates) this.bufferedUpdates = [];
    this.actions.setDSHTranscriptRetryAvailable(this.tabId, false);
    this.actions.setTurnActive(this.tabId, false);
    this.actions.setSessionState(this.tabId, "starting");
    this.recoveryPromise = this.loadAndReplay(incarnation, this.recoveryGeneration);
    // fire-and-forget: incoming daemon notifications must not await durable I/O.
    void this.recoveryPromise.catch(() => undefined);
  }

  private discardSpeculativeEvents(): void {
    this.events = this.events.slice(0, this.durableThroughSeq + 1);
    this.nextSeq = this.events.length;
    this.clearActiveTextStream();
    this.projectEvents();
  }

  private bufferUpdate(incarnation: string, update: DSHUpdate): void {
    if (update.event && this.recoveryReplayThroughSeq !== null && update.event.seq <= this.recoveryReplayThroughSeq) {
      return;
    }
    if (this.bufferedUpdates.length >= MAX_BUFFERED_UPDATES) {
      this.markBlocked("DSH transcript reload buffer overflow");
      return;
    }
    this.bufferedUpdates.push({ incarnation, update });
  }

  private async loadAndReplay(incarnation: string, generation: number): Promise<void> {
    try {
      const snapshot = await this.loadDurableSnapshot();
      if (this.controllerState !== "recovering" || generation !== this.recoveryGeneration) return;
      const events = this.validateSnapshot(snapshot);
      const hasNewIncarnation = snapshot.incarnation !== incarnation;
      // The validated durable snapshot supersedes the reset target. Replay
      // notifications from the subsequent attach must be buffered under it.
      if (hasNewIncarnation) this.recoveryIncarnation = snapshot.incarnation;
      this.incarnation = snapshot.incarnation;
      this.events = events;
      this.nextSeq = events.length;
      this.durableThroughSeq = snapshot.durableThroughSeq;
      this.clearActiveTextStream();
      this.projectEvents();
      const cursor = {
        sessionId: this.sessionId,
        incarnation: this.incarnation,
        durableThroughSeq: this.durableThroughSeq,
      };
      this.onDurableCursor(cursor);
      const attachSnapshot = await this.attachSnapshotIncarnation(cursor);
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
          if (bufferedUpdate.incarnation === this.recoveryIncarnation) this.applyUpdate(bufferedUpdate.update);
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
    if (!snapshot.incarnation || snapshot.asOfSeq !== snapshot.durableThroughSeq)
      throw new TypeError("DSH durable history cursor mismatch");
    if (snapshot.events.length !== snapshot.durableThroughSeq + 1)
      throw new TypeError("DSH durable history is not contiguous");
    return snapshot.events.map((event, seq) => {
      const payload = parseDSHFrontendPayload({
        sessionId: this.sessionId,
        tabId: this.tabId,
        workspaceId: "durable-history",
        incarnation: snapshot.incarnation,
        update: { event: { sessionId: this.sessionId, seq, event } },
      });
      if (!payload?.update.event) throw new TypeError("DSH durable history event is invalid");
      return payload.update.event;
    });
  }

  private projectEvents(): void {
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
