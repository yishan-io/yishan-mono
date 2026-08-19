import type { DesktopRpcEventEnvelope } from "../../../main/ipc";
import { subscribeDesktopRpcEvent } from "../../events/desktopRpcEventBus";
import { type BackendEventName, type NormalizedBackendEvent, normalizeBackendEvent } from "./backendEventAdapter";

type NormalizedBackendEventListener = (event: NormalizedBackendEvent) => void;

type BackendEventPipelineDependencies = {
  subscribeRawEvent: (listener: (envelope: DesktopRpcEventEnvelope) => void) => () => void;
  normalize: (envelope: DesktopRpcEventEnvelope) => NormalizedBackendEvent | null;
};

type BackendEventPipeline = {
  start: () => () => void;
  stop: () => void;
  subscribe: (name: BackendEventName, listener: NormalizedBackendEventListener) => () => void;
  subscribeAll: (listener: NormalizedBackendEventListener) => () => void;
};

const DEFAULT_PIPELINE_DEPENDENCIES: BackendEventPipelineDependencies = {
  subscribeRawEvent: subscribeDesktopRpcEvent,
  normalize: normalizeBackendEvent,
};

/** Dispatches one normalized event to matching listeners. */
function emitNormalizedEvent(
  listenersByName: Map<BackendEventName, Set<NormalizedBackendEventListener>>,
  allListeners: Set<NormalizedBackendEventListener>,
  event: NormalizedBackendEvent,
) {
  const listeners = listenersByName.get(event.name);
  if (listeners) {
    for (const listener of listeners) {
      listener(event);
    }
  }

  for (const listener of allListeners) {
    listener(event);
  }
}

/**
 * Creates a centralized backend event pipeline with normalized event fanout.
 */
export function createBackendEventPipeline(
  dependencies: BackendEventPipelineDependencies = DEFAULT_PIPELINE_DEPENDENCIES,
): BackendEventPipeline {
  const listenersByName = new Map<BackendEventName, Set<NormalizedBackendEventListener>>();
  const allListeners = new Set<NormalizedBackendEventListener>();
  let activeStarts = 0;
  let unsubscribeRawEvents: (() => void) | null = null;

  /** Handles one raw desktop RPC envelope and forwards normalized events. */
  function handleRawEvent(envelope: DesktopRpcEventEnvelope) {
    const normalizedEvent = dependencies.normalize(envelope);
    if (!normalizedEvent) {
      return;
    }

    emitNormalizedEvent(listenersByName, allListeners, normalizedEvent);
  }

  /** Starts the raw subscription once and returns one scoped stop handle. */
  function start() {
    if (activeStarts === 0) {
      unsubscribeRawEvents = dependencies.subscribeRawEvent(handleRawEvent);
    }
    activeStarts += 1;

    return () => {
      stop();
    };
  }

  /** Stops one active consumer and tears down transport subscription when last consumer leaves. */
  function stop() {
    if (activeStarts === 0) {
      return;
    }

    activeStarts -= 1;
    if (activeStarts > 0) {
      return;
    }

    unsubscribeRawEvents?.();
    unsubscribeRawEvents = null;
  }

  /** Subscribes to one normalized backend event name. */
  function subscribe(name: BackendEventName, listener: NormalizedBackendEventListener) {
    const listeners = listenersByName.get(name) ?? new Set<NormalizedBackendEventListener>();
    listeners.add(listener);
    listenersByName.set(name, listeners);

    return () => {
      const activeListeners = listenersByName.get(name);
      if (!activeListeners) {
        return;
      }

      activeListeners.delete(listener);
      if (activeListeners.size === 0) {
        listenersByName.delete(name);
      }
    };
  }

  /** Subscribes to all normalized backend events. */
  function subscribeAll(listener: NormalizedBackendEventListener) {
    allListeners.add(listener);
    return () => {
      allListeners.delete(listener);
    };
  }

  return {
    start,
    stop,
    subscribe,
    subscribeAll,
  };
}

const backendEventPipeline = createBackendEventPipeline();

/**
 * Starts the shared backend event pipeline.
 *
 * The returned function releases one start reference.
 */
export function startBackendEventPipeline() {
  return backendEventPipeline.start();
}

/**
 * Subscribes to one normalized backend event name from the shared pipeline.
 */
export function subscribeBackendEvent(name: BackendEventName, listener: NormalizedBackendEventListener) {
  return backendEventPipeline.subscribe(name, listener);
}

/**
 * Subscribes to all normalized backend events from the shared pipeline.
 */
export function subscribeAllBackendEvents(listener: NormalizedBackendEventListener) {
  return backendEventPipeline.subscribeAll(listener);
}
