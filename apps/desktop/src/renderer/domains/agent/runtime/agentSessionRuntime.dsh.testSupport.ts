import { tabStore } from "../../workbench";
import { agentChatStore } from "../state/agentChatStore";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();

export function dshAttachResult(sessionId: string) {
  return {
    runtime: "dsh" as const,
    sessionId,
    instanceId: "run-1",
    events: [],
    asOfSeq: -1,
    durableThroughSeq: -1,
    headSeq: -1,
  };
}

export function resetDshTestState() {
  agentChatStore.setState(initialAgentChatStoreState, true);
  tabStore.setState(initialTabStoreState, true);
}
