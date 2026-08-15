package node

func (s *Service) recordAgentUsage(workspaceID string, agent string) {
	if workspaceID == "" || agent == "" || agent == "unknown" {
		return
	}
	s.agentUsageMu.Lock()
	defer s.agentUsageMu.Unlock()
	if s.agentUsage[workspaceID] == nil {
		s.agentUsage[workspaceID] = make(map[string]struct{})
	}
	s.agentUsage[workspaceID][agent] = struct{}{}
}

func (s *Service) getAgentUsage(workspaceID string) []string {
	s.agentUsageMu.Lock()
	agents := s.agentUsage[workspaceID]
	s.agentUsageMu.Unlock()

	if len(agents) == 0 {
		return nil
	}
	names := make([]string, 0, len(agents))
	for a := range agents {
		names = append(names, a)
	}
	return names
}

func (s *Service) clearAgentUsage(workspaceID string) {
	s.agentUsageMu.Lock()
	delete(s.agentUsage, workspaceID)
	s.agentUsageMu.Unlock()
}
