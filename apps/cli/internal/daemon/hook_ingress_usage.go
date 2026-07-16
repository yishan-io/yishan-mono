package daemon

func (h *JSONRPCHandler) recordAgentUsage(workspaceID string, agent string) {
	if workspaceID == "" || agent == "" || agent == "unknown" {
		return
	}
	h.agentUsageMu.Lock()
	defer h.agentUsageMu.Unlock()
	if h.agentUsage[workspaceID] == nil {
		h.agentUsage[workspaceID] = make(map[string]struct{})
	}
	h.agentUsage[workspaceID][agent] = struct{}{}
}

func (h *JSONRPCHandler) getAgentUsage(workspaceID string) []string {
	h.agentUsageMu.Lock()
	agents := h.agentUsage[workspaceID]
	h.agentUsageMu.Unlock()

	if len(agents) == 0 {
		return nil
	}
	names := make([]string, 0, len(agents))
	for a := range agents {
		names = append(names, a)
	}
	return names
}

func (h *JSONRPCHandler) clearAgentUsage(workspaceID string) {
	h.agentUsageMu.Lock()
	delete(h.agentUsage, workspaceID)
	h.agentUsageMu.Unlock()
}
