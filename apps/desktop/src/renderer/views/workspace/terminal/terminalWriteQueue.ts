import type { Terminal } from "@xterm/xterm";

const MAX_TERMINAL_LIVE_WRITE_QUEUE_BYTES = 1024 * 1024;
const MAX_IMMEDIATE_TERMINAL_CHUNK_BYTES = 256;
const MAX_ATTACHED_BATCH_BYTES = 32 * 1024;
const DETACHED_WRITE_INTERVAL_MS = 500;
const INTERACTIVE_BURST_WINDOW_MS = 24;

export type TerminalWriteChunk = string | Uint8Array;

export type TerminalWriteQueue = {
  enqueue: (chunk: TerminalWriteChunk) => void;
  /** Toggle detached mode — uses longer batching interval when hidden, flushes immediately on reattach. */
  setDetached: (detached: boolean) => void;
  dispose: () => void;
};

/** Creates one bounded frame-batched writer so small PTY chunks do not spam xterm.write. */
export function createTerminalWriteQueue(terminal: Terminal): TerminalWriteQueue {
  let pendingBytes = 0;
  let disposed = false;
  let attachedFlushAnimationFrameId: number | null = null;
  let detachedFlushTimerId: ReturnType<typeof setTimeout> | null = null;
  let writeInFlight = false;
  let detached = false;
  let lastWriteCompletedAt = 0;
  const chunks: TerminalWriteChunk[] = [];

  const cancelScheduledFlush = (): void => {
    if (attachedFlushAnimationFrameId !== null) {
      cancelAnimationFrame(attachedFlushAnimationFrameId);
      attachedFlushAnimationFrameId = null;
    }
    if (detachedFlushTimerId !== null) {
      clearTimeout(detachedFlushTimerId);
      detachedFlushTimerId = null;
    }
  };

  const scheduleFlush = (): void => {
    if (disposed || writeInFlight || chunks.length === 0) {
      return;
    }

    if (detached) {
      if (detachedFlushTimerId !== null) {
        return; // already scheduled
      }
      // Detached: flush at a large interval to reduce main-thread pressure
      // while still progressing terminal buffer state in the background.
      detachedFlushTimerId = setTimeout(() => {
        detachedFlushTimerId = null;
        flushNextBatch();
      }, DETACHED_WRITE_INTERVAL_MS);
      return;
    } else {
      if (attachedFlushAnimationFrameId !== null) {
        return; // already scheduled
      }
      // Attached mode: align writes to a frame budget to batch bursty output
      // and reduce renderer churn under high-throughput streams.
      attachedFlushAnimationFrameId = requestAnimationFrame(() => {
        attachedFlushAnimationFrameId = null;
        flushNextBatch();
      });
    }
  };

  const writeChunk = (chunk: TerminalWriteChunk): void => {
    writeInFlight = true;
    terminal.write(chunk, () => {
      writeInFlight = false;
      lastWriteCompletedAt = Date.now();
      flushNextBatch();
    });
  };

  const flushNextBatch = (): void => {
    if (disposed || writeInFlight || chunks.length === 0) {
      return;
    }

    const batch = takeTerminalWriteBatch(chunks, detached ? Number.POSITIVE_INFINITY : MAX_ATTACHED_BATCH_BYTES);
    pendingBytes = Math.max(0, pendingBytes - getTerminalWriteChunkLength(batch));
    writeChunk(batch);
  };

  const flushAllRemaining = (): void => {
    if (disposed || chunks.length === 0) {
      return;
    }
    cancelScheduledFlush();
    // Drain remaining chunks without waiting for next tick.
    if (!writeInFlight) {
      flushNextBatch();
    }
  };

  const enqueue = (chunk: TerminalWriteChunk): void => {
    if (disposed) {
      return;
    }

    if (!detached && !writeInFlight && chunks.length === 0 && isInteractiveTerminalChunk(chunk) && !isBurstingOutput(lastWriteCompletedAt)) {
      writeChunk(chunk);
      return;
    }

    const shouldScheduleFlush = chunks.length === 0;
    chunks.push(chunk);
    pendingBytes += getTerminalWriteChunkLength(chunk);

    while (pendingBytes > MAX_TERMINAL_LIVE_WRITE_QUEUE_BYTES && chunks.length > 1) {
      const droppedChunk = chunks.shift();
      if (!droppedChunk) {
        break;
      }
      pendingBytes = Math.max(0, pendingBytes - getTerminalWriteChunkLength(droppedChunk));
    }

    if (shouldScheduleFlush) {
      scheduleFlush();
    }
  };

  return {
    enqueue,
    setDetached: (value: boolean) => {
      if (disposed || detached === value) {
        return;
      }
      detached = value;

      if (!detached) {
        // Reattaching — drain any queued output immediately.
        flushAllRemaining();
      }
      // If switching to detached, in-flight writes will complete;
      // subsequent flushes use the longer interval.
    },
    dispose: () => {
      disposed = true;
      cancelScheduledFlush();
      chunks.length = 0;
      pendingBytes = 0;
    },
  };
}

function isInteractiveTerminalChunk(chunk: TerminalWriteChunk): boolean {
  return getTerminalWriteChunkLength(chunk) <= MAX_IMMEDIATE_TERMINAL_CHUNK_BYTES;
}

function isBurstingOutput(lastWriteCompletedAt: number): boolean {
  if (lastWriteCompletedAt <= 0) {
    return false;
  }
  return Date.now() - lastWriteCompletedAt <= INTERACTIVE_BURST_WINDOW_MS;
}

/** Takes and combines one run of same-type chunks into a single xterm.write payload. */
function takeTerminalWriteBatch(chunks: TerminalWriteChunk[], maxBatchBytes: number): TerminalWriteChunk {
  const first = chunks.shift();
  if (!first) {
    return "";
  }

  if (typeof first === "string") {
    let output = first;
    let byteLength = first.length;
    while (typeof chunks[0] === "string") {
      const next = chunks[0] as string;
      if (byteLength + next.length > maxBatchBytes) {
        break;
      }
      output += chunks.shift() as string;
      byteLength += next.length;
    }
    return output;
  }

  const byteChunks = [first];
  let byteLength = first.byteLength;
  while (chunks[0] instanceof Uint8Array) {
    const next = chunks[0] as Uint8Array;
    if (byteLength + next.byteLength > maxBatchBytes) {
      break;
    }
    chunks.shift();
    byteChunks.push(next);
    byteLength += next.byteLength;
  }

  if (byteChunks.length === 1) {
    return first;
  }

  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const byteChunk of byteChunks) {
    output.set(byteChunk, offset);
    offset += byteChunk.byteLength;
  }
  return output;
}

/** Returns the queued write payload size in bytes for pressure control. */
function getTerminalWriteChunkLength(chunk: TerminalWriteChunk): number {
  return typeof chunk === "string" ? chunk.length : chunk.byteLength;
}
