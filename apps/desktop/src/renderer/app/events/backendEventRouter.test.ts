import { describe, expect, it, vi } from "vitest";
import { createBackendEventPipeline } from "./backendEventRouter";

type RawEventListener = (envelope: { method: string; payload?: unknown }) => void;

/**
 * Creates one in-memory raw transport stub with explicit listener capture.
 */
function createRawTransportStub() {
  let listener: RawEventListener | null = null;
  const unsubscribe = vi.fn();
  const subscribeRawEvent = vi.fn((nextListener: RawEventListener) => {
    listener = nextListener;
    return () => {
      unsubscribe();
      listener = null;
    };
  });

  return {
    subscribeRawEvent,
    unsubscribe,
    emit(envelope: { method: string; payload?: unknown }) {
      listener?.(envelope);
    },
  };
}

describe("createBackendEventPipeline", () => {
  it("subscribes to raw transport once and reference-counts starts", () => {
    const rawTransport = createRawTransportStub();
    const pipeline = createBackendEventPipeline({
      subscribeRawEvent: rawTransport.subscribeRawEvent,
      normalize: () => null,
    });

    const stopOne = pipeline.start();
    const stopTwo = pipeline.start();

    expect(rawTransport.subscribeRawEvent).toHaveBeenCalledTimes(1);

    stopOne();
    expect(rawTransport.unsubscribe).not.toHaveBeenCalled();

    stopTwo();
    expect(rawTransport.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("dispatches normalized events to named and wildcard listeners", () => {
    const rawTransport = createRawTransportStub();
    const pipeline = createBackendEventPipeline({
      subscribeRawEvent: rawTransport.subscribeRawEvent,
      normalize: (envelope) => {
        if (envelope.method !== "gitChanged") {
          return null;
        }

        return {
          source: "gitChanged",
          name: "git.changed",
          payload: {
            workspaceWorktreePath: "/tmp/worktree",
          },
        };
      },
    });

    const onNamed = vi.fn();
    const onAll = vi.fn();

    const stopPipeline = pipeline.start();
    const unsubscribeNamed = pipeline.subscribe("git.changed", onNamed);
    const unsubscribeAll = pipeline.subscribeAll(onAll);

    rawTransport.emit({ method: "gitChanged", payload: {} });

    expect(onNamed).toHaveBeenCalledTimes(1);
    expect(onAll).toHaveBeenCalledTimes(1);

    unsubscribeNamed();
    unsubscribeAll();
    stopPipeline();
  });

  it("does not dispatch when normalizer rejects an event", () => {
    const rawTransport = createRawTransportStub();
    const pipeline = createBackendEventPipeline({
      subscribeRawEvent: rawTransport.subscribeRawEvent,
      normalize: () => null,
    });

    const onNamed = vi.fn();
    const stopPipeline = pipeline.start();
    pipeline.subscribe("git.changed", onNamed);

    rawTransport.emit({ method: "gitChanged", payload: {} });

    expect(onNamed).not.toHaveBeenCalled();

    stopPipeline();
  });
});
