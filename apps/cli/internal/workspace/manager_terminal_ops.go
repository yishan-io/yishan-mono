package workspace

import "yishan/apps/cli/internal/workspace/terminal"

func (m *Manager) TerminalSend(req TerminalSendRequest) (TerminalSendResponse, error) {
	return m.terminals.Send(req)
}

// TerminalSendRaw writes raw bytes directly to a PTY session,
// bypassing JSON serialization for the binary WebSocket fast-path.
func (m *Manager) TerminalSendRaw(sessionID string, data []byte) {
	m.terminals.SendRaw(sessionID, data)
}

func (m *Manager) TerminalListSessions(req TerminalListSessionsRequest) []TerminalSessionSummary {
	return m.terminals.ListSessions(req)
}

func (m *Manager) TerminalListDetectedPorts() []TerminalDetectedPort {
	return m.terminals.ListDetectedPorts()
}

func (m *Manager) SetActiveWorkspace(req SetActiveWorkspaceRequest) (SetActiveWorkspaceResponse, error) {
	return m.terminals.SetActiveWorkspace(req)
}

func (m *Manager) TerminalRead(req TerminalReadRequest) (TerminalReadResponse, error) {
	return m.terminals.Read(req)
}

func (m *Manager) TerminalStop(req TerminalStopRequest) (TerminalStopResponse, error) {
	return m.terminals.Stop(req)
}

func (m *Manager) TerminalKillProcess(req TerminalKillProcessRequest) (TerminalKillProcessResponse, error) {
	return m.terminals.KillProcess(req)
}

func (m *Manager) TerminalResize(req TerminalResizeRequest) (TerminalResizeResponse, error) {
	return m.terminals.Resize(req)
}

func (m *Manager) TerminalSubscribe(req TerminalSubscribeRequest) (TerminalSubscription, error) {
	return m.terminals.Subscribe(req)
}

func (m *Manager) TerminalUnsubscribe(req TerminalUnsubscribeRequest) (TerminalUnsubscribeResponse, error) {
	return m.terminals.Unsubscribe(req)
}

func (m *Manager) SetTerminalDetectedPortsListener(listener func([]TerminalDetectedPort)) {
	if listener == nil {
		m.terminals.SetPortsChangedListener(nil)
		return
	}

	m.terminals.SetPortsChangedListener(func(ports []terminal.DetectedPort) {
		listener(ports)
	})
}
