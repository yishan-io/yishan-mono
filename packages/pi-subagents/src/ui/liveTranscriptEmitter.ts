import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

import type { AgentRecord } from "../agents/types";
import { countUtf8Bytes } from "./liveTranscriptBudget";
import { buildLiveTranscriptPayload } from "./liveTranscriptPayload";

export const LIVE_TRANSCRIPTS_WIDGET_KEY = "pi-subagents-live-transcripts";

/**
 * Default minimum interval between live-transcript widget emissions.
 *
 * Token-level streaming can fire many session-change notifications per second.
 * Coalescing only within one event-loop tick is insufficient there, so we use
 * an explicit time window: at most one snapshot (the latest one) is serialized
 * and emitted per window, no matter how many notifications arrive.
 */
export const LIVE_TRANSCRIPT_THROTTLE_MS = 150;

export interface LiveTranscriptEmitterOptions {
  /** Minimum interval between emissions. Defaults to LIVE_TRANSCRIPT_THROTTLE_MS. */
  throttleMs?: number;
}

/** Emission counters for diagnostics and stress tests. */
export interface LiveTranscriptEmitterStats {
  /** Widget emissions that carried a payload (clears not counted). */
  emissions: number;
  /** Widget emissions that cleared the payload. */
  clears: number;
  /** Cumulative UTF-8 bytes of emitted payloads. */
  serializedBytes: number;
  /** Largest single emitted payload in UTF-8 bytes. */
  peakPayloadBytes: number;
  /** Pushes absorbed because a flush was already scheduled (latest wins). */
  coalesced: number;
  /** Flushes whose snapshot matched the last emission and were skipped. */
  skippedIdentical: number;
  /** Messages dropped by emit-side budgets. */
  droppedMessages: number;
  /** Children dropped by the aggregate budget. */
  droppedChildren: number;
}

export interface LiveTranscriptEmitter {
  /** Feeds the latest manager snapshot. Records without active children clear the widget. */
  push(records: readonly AgentRecord[]): void;
  /** Serializes and emits the pending snapshot immediately (used by tests). */
  flushNow(): void;
  /** Cancels scheduled work and stops emitting. Safe to call multiple times. */
  dispose(): void;
  readonly stats: LiveTranscriptEmitterStats;
}

/**
 * Time-throttled, latest-value-wins emitter for the live-transcript widget.
 *
 * Guarantees:
 * - Serialization happens only at flush time, at most once per throttle window.
 * - At most one latest snapshot is pending at any time (coalescing).
 * - Identical snapshots are skipped (dedupe).
 * - No active children clears the widget immediately and supersedes any pending
 *   payload flush.
 * - dispose() cancels scheduled work; no emission can fire after it.
 */
export function createLiveTranscriptEmitter(
  ui: ExtensionUIContext,
  options: LiveTranscriptEmitterOptions = {},
): LiveTranscriptEmitter {
  const throttleMs = options.throttleMs ?? LIVE_TRANSCRIPT_THROTTLE_MS;
  const stats: LiveTranscriptEmitterStats = {
    emissions: 0,
    clears: 0,
    serializedBytes: 0,
    peakPayloadBytes: 0,
    coalesced: 0,
    skippedIdentical: 0,
    droppedMessages: 0,
    droppedChildren: 0,
  };

  let pendingRecords: readonly AgentRecord[] | undefined;
  let pendingClear = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Last emitted widget string; undefined means the widget is cleared. */
  let lastEmittedWidget: string | undefined;
  let disposed = false;

  const scheduleFlush = (records: readonly AgentRecord[] | undefined): void => {
    if (disposed) {
      return;
    }
    if (records) {
      pendingRecords = records;
      pendingClear = false;
    } else {
      pendingRecords = undefined;
      pendingClear = true;
    }

    if (timer) {
      // Latest-value-wins: the pending snapshot is replaced, no second timer.
      stats.coalesced += 1;
      return;
    }

    timer = setTimeout(() => {
      timer = undefined;
      flush();
    }, throttleMs);
  };

  const flush = (): void => {
    if (disposed) {
      return;
    }

    const records = pendingRecords;
    const clear = pendingClear;
    pendingRecords = undefined;
    pendingClear = false;

    if (clear) {
      if (lastEmittedWidget !== undefined) {
        lastEmittedWidget = undefined;
        ui.setWidget(LIVE_TRANSCRIPTS_WIDGET_KEY, undefined);
        stats.clears += 1;
      } else {
        stats.skippedIdentical += 1;
      }
      return;
    }

    if (!records) {
      return;
    }

    const { payload, stats: budgetStats } = buildLiveTranscriptPayload(records);
    stats.droppedMessages += budgetStats.droppedMessages;
    stats.droppedChildren += budgetStats.droppedChildren;
    if (!payload) {
      // No active children in the snapshot: same as a clear.
      if (lastEmittedWidget !== undefined) {
        lastEmittedWidget = undefined;
        ui.setWidget(LIVE_TRANSCRIPTS_WIDGET_KEY, undefined);
        stats.clears += 1;
      } else {
        stats.skippedIdentical += 1;
      }
      return;
    }

    const widget = JSON.stringify(payload);
    if (widget === lastEmittedWidget) {
      stats.skippedIdentical += 1;
      return;
    }

    lastEmittedWidget = widget;
    ui.setWidget(LIVE_TRANSCRIPTS_WIDGET_KEY, [widget]);
    stats.emissions += 1;
    const widgetBytes = countUtf8Bytes(widget);
    stats.serializedBytes += widgetBytes;
    if (widgetBytes > stats.peakPayloadBytes) {
      stats.peakPayloadBytes = widgetBytes;
    }
  };

  return {
    push(records: readonly AgentRecord[]): void {
      const hasActiveChildren = records.some(
        (record) => record.status === "queued" || record.status === "starting" || record.status === "running",
      );
      if (hasActiveChildren) {
        scheduleFlush(records);
      } else {
        // Clear is emitted immediately: a stale payload must never linger for
        // a full throttle window after the last child completes.
        if (disposed) {
          return;
        }
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        pendingRecords = undefined;
        pendingClear = true;
        flush();
      }
    },

    flushNow(): void {
      if (disposed) {
        return;
      }
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      flush();
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      pendingRecords = undefined;
      pendingClear = false;
    },

    stats,
  };
}
