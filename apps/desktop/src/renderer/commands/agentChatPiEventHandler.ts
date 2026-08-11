import {
  type AgentQueueState,
  PER_MESSAGE_UTF8_BYTES,
  agentChatStore,
  applyStreamDelta,
  applySubagentLifecycleWidget,
  applySubagentLiveTranscripts,
  cloneAgentMessage,
  cloneIncomingAgentMessage,
  flushAgentChatStreamBuffer,
  generateId,
  getLatestStreamingMessage,
  handlePiResponse,
  invalidateAgentSessionStats,
  normalizeIncomingAgentMessage,
  parseAgentStreamEvent,
  parsePendingUiRequest,
  parseSubagentLifecycleWidget,
  parseSubagentLiveTranscripts,
  parseSubagentProgressTargets,
  queueStreamingMessageUpdate,
  refreshAgentSessionStats,
  truncateMessageContent,
  truncateUtf8Bytes,
} from "./agentChatPiEventShared";

// ─── Pi event handler ─────────────────────────────────────────────────────────

function parseCompactionReason(value: unknown): "manual" | "threshold" | "overflow" | null {
  return value === "manual" || value === "threshold" || value === "overflow" ? value : null;
}

/** Payload routed to handleAgentPiEvent for one agent.chat session. */
export type PiEventPayload = {
  sessionId: string;
  tabId: string;
  workspaceId: string;
  event: Record<string, unknown>;
};

/**
 * Handles a single agent.pi.event payload from the daemon frontend event stream.
 * Routes to the correct tab's store based on the tabId in the payload.
 */
export function handleAgentPiEvent(payload: PiEventPayload): void {
  const { sessionId, tabId, event } = payload;
  const currentSession = agentChatStore.getState().sessionsByTabId[tabId];

  if (!currentSession) {
    return;
  }
  if (currentSession.sessionId !== sessionId) {
    return;
  }

  switch (event.type) {
    case "agent_start":
      agentChatStore.getState().setCompactionReason(tabId, null);
      agentChatStore.getState().setSessionState(tabId, "running");
      // Session stats snapshot is stale from the moment a new run starts producing tokens.
      invalidateAgentSessionStats(tabId, sessionId);
      break;

    case "session_end":
      // The owning Pi process exited. The whole tab is invalid: surface the
      // error immediately and treat every previously running sub-agent row as
      // interrupted history (they died with the process).
      agentChatStore.getState().setSessionError(tabId, "Agent session ended unexpectedly");
      agentChatStore.getState().setSubagentSessionEndedAt(tabId, Date.now());
      break;

    case "agent_end":
      flushAgentChatStreamBuffer(tabId);
      break;

    case "agent_settled":
      flushAgentChatStreamBuffer(tabId);
      agentChatStore.getState().clearPendingUiRequest(tabId);
      agentChatStore.getState().clearPendingUiAutoResponse(tabId);
      agentChatStore.getState().setCompactionReason(tabId, null);
      agentChatStore.getState().setTurnActive(tabId, false);
      agentChatStore.getState().setActiveCoreTurnAssistantId(tabId, null);
      agentChatStore.getState().setSessionState(tabId, "idle");
      // fire-and-forget: stats refresh cannot affect chat lifecycle after settlement.
      void refreshAgentSessionStats(sessionId).catch((error) => {
        console.warn("Failed to refresh agent session stats after settlement", error);
      });
      break;

    case "message_start": {
      const msg = normalizeIncomingAgentMessage(event.message);
      if (msg?.role === "assistant") {
        const turnError = msg.errorMessage?.trim();
        if (turnError) {
          agentChatStore.getState().setTurnError(tabId, turnError);
        } else {
          agentChatStore.getState().clearTurnError(tabId);
        }

        flushAgentChatStreamBuffer(tabId);
        const messageId = msg.id ?? generateId();
        const clonedMessage = cloneIncomingAgentMessage(msg);
        agentChatStore.getState().updateStreamingMessage(tabId, {
          ...clonedMessage,
          id: messageId,
          startedAtMs: Date.now(),
        });
        // Bind this core turn to its assistant only while the turn is active, so
        // turn_end extends exactly this committed message through foreground tool
        // execution and cannot finalize a message that started before turn_start.
        if (agentChatStore.getState().sessionsByTabId[tabId]?.isTurnActive) {
          agentChatStore.getState().setActiveCoreTurnAssistantId(tabId, messageId);
        }
      }
      break;
    }

    case "message_update": {
      const snapshot = normalizeIncomingAgentMessage(event.message);
      if (snapshot?.role === "assistant") {
        const turnError = snapshot.errorMessage?.trim();
        if (turnError) {
          agentChatStore.getState().setTurnError(tabId, turnError);
        }

        const base = getLatestStreamingMessage(tabId);
        const clonedSnapshot = cloneIncomingAgentMessage(snapshot);
        queueStreamingMessageUpdate(tabId, {
          ...clonedSnapshot,
          id: base?.id ?? snapshot.id ?? generateId(),
          startedAtMs: base?.startedAtMs,
          durationMs: base?.durationMs,
        });
        break;
      }

      const delta = parseAgentStreamEvent(event.assistantMessageEvent);
      const base = getLatestStreamingMessage(tabId);
      if (!delta || !base) break;

      const nextMessage = cloneAgentMessage(base);
      applyStreamDelta(nextMessage, delta);
      truncateMessageContent(nextMessage);
      queueStreamingMessageUpdate(tabId, nextMessage);
      break;
    }

    case "message_end": {
      const msg = normalizeIncomingAgentMessage(event.message);
      if (!msg) break;

      flushAgentChatStreamBuffer(tabId);

      if (msg.role === "assistant") {
        const turnError = msg.errorMessage?.trim();
        if (turnError) {
          agentChatStore.getState().setTurnError(tabId, turnError);
        } else {
          agentChatStore.getState().clearTurnError(tabId);
        }

        const base = getLatestStreamingMessage(tabId);
        const startedAtMs = base?.startedAtMs;
        if (typeof startedAtMs === "number") {
          // Renderer observed the streaming start: keep its timing and commit;
          // turn_end later extends this message through foreground tool work.
          const clonedMessage = cloneIncomingAgentMessage(msg);
          agentChatStore.getState().updateStreamingMessage(tabId, {
            ...clonedMessage,
            id: base?.id ?? msg.id ?? generateId(),
            startedAtMs,
            durationMs: Math.max(0, Date.now() - startedAtMs),
          });
          agentChatStore.getState().finalizeStreamingMessage(tabId);
        } else {
          // No renderer-observed start (e.g. replaceMessages cleared the
          // streaming message): commit without fabricated timing so turn_end
          // cannot extend this message retroactively.
          agentChatStore.getState().appendMessage(tabId, {
            ...cloneIncomingAgentMessage(msg),
            id: msg.id ?? generateId(),
          });
          agentChatStore.getState().setActiveCoreTurnAssistantId(tabId, null);
        }
      } else {
        agentChatStore.getState().appendMessage(tabId, {
          ...cloneIncomingAgentMessage(msg),
          id: msg.id ?? generateId(),
        });
      }
      break;
    }

    case "tool_execution_start":
    case "tool_execution_update":
    case "tool_execution_end":
      break;

    case "queue_update": {
      const queue = event as unknown as AgentQueueState;
      agentChatStore.getState().setQueue(tabId, {
        steering: (queue.steering ?? []).map((s) => truncateUtf8Bytes(s, PER_MESSAGE_UTF8_BYTES)),
        followUp: (queue.followUp ?? []).map((s) => truncateUtf8Bytes(s, PER_MESSAGE_UTF8_BYTES)),
      });
      break;
    }

    case "extension_ui_request": {
      const request = parsePendingUiRequest(event);
      if (request) {
        agentChatStore.getState().setPendingUiRequest(tabId, request);
      }

      const subagentProgressTargets = parseSubagentProgressTargets(event);
      if (subagentProgressTargets) {
        agentChatStore.getState().setSubagentProgressTargets(tabId, subagentProgressTargets);
      }

      const subagentLiveTranscripts = parseSubagentLiveTranscripts(event);
      if (subagentLiveTranscripts) {
        applySubagentLiveTranscripts(tabId, subagentLiveTranscripts);
      }

      // Live started/completed entries keep sub-agent rows and their real ids
      // in sync with the session without waiting for a get_messages round trip.
      const subagentLifecycleEntries = parseSubagentLifecycleWidget(event);
      if (subagentLifecycleEntries) {
        applySubagentLifecycleWidget(tabId, subagentLifecycleEntries);
      }
      break;
    }

    case "turn_start":
      agentChatStore.getState().setTurnActive(tabId, true);
      // A new core turn starts with no assistant bound yet.
      agentChatStore.getState().setActiveCoreTurnAssistantId(tabId, null);
      // Steering/follow-up turns within one run also produce new tokens; the snapshot is stale.
      invalidateAgentSessionStats(tabId, sessionId);
      break;

    case "compaction_start":
      agentChatStore.getState().setCompactionReason(tabId, parseCompactionReason(event.reason));
      agentChatStore.getState().setSessionState(tabId, "compacting");
      break;

    case "turn_end":
      agentChatStore.getState().clearPendingUiAutoResponse(tabId);
      // Extend the bound assistant through all foreground tool work before the
      // turn is marked inactive; a payload-free turn_end still finalizes it.
      agentChatStore.getState().finalizeActiveCoreTurnAssistant(tabId, Date.now());
      agentChatStore.getState().setTurnActive(tabId, false);
      break;

    case "compaction_end": {
      agentChatStore.getState().clearPendingUiAutoResponse(tabId);
      const errorMessage = typeof event.errorMessage === "string" ? event.errorMessage.trim() : "";
      if (errorMessage) {
        agentChatStore.getState().setTurnError(tabId, errorMessage);
      }
      const isManualCompletion = event.reason === "manual" && event.willRetry !== true;
      if (isManualCompletion || (event.reason === "manual" && (event.aborted === true || errorMessage))) {
        agentChatStore.getState().setCompactionReason(tabId, null);
        agentChatStore.getState().setSessionState(tabId, "idle");
      }
      // fire-and-forget: Pi reports post-compaction context as unknown until the next assistant usage update.
      void refreshAgentSessionStats(sessionId).catch((error) => {
        console.warn("Failed to refresh agent session stats after compaction", error);
      });
      break;
    }

    case "response":
      handlePiResponse(tabId, sessionId, event);
      break;

    default:
      break;
  }
}
